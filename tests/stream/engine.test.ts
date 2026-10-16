import { describe, expect, it } from 'vitest';
import { ENCODE_S, SAMPLE_S, nominalSizes, planStream, streamSnapshot } from '../../src/sim/stream/engine';
import { BUFFER_TIME_AT_TOP_QUALITY_S } from '../../src/sim/stream/dashjs';
import type { ProfileId } from '../../src/sim/stream/profiles';
import { STREAM_STAGES, type StreamConfig } from '../../src/sim/stream/types';

const LADDER = [400, 1200, 2800, 5000];
// São Paulo → Tóquio with the edge in Hong Kong (values from mockup v9)
const cfg = (profile: ProfileId, over: Partial<StreamConfig> = {}): StreamConfig => ({
  ladderKbps: LADDER, segBytes: nominalSizes(LADDER, 15, 2, 7), segDur: 2,
  profile, seed: 7, loss: 0, mss: 1024, rttEdge: 0.04, rttOrigin: 0.259, ...over,
});
const fiber = planStream(cfg('fiber'));
const tunnel = planStream(cfg('tunnel'));
const done = (p: typeof fiber) => p.attempts.filter((a) => !a.abandoned);

describe('nominalSizes', () => {
  it('is bitrate × duration with ±18 % VBR, deterministic', () => {
    const s = nominalSizes(LADDER, 15, 2, 7);
    expect(s).toHaveLength(4);
    expect(s[3]).toHaveLength(15);
    for (const [r, row] of s.entries()) for (const b of row) {
      expect(b).toBeGreaterThanOrEqual(LADDER[r] * 125 * 2 * 0.82);
      expect(b).toBeLessThanOrEqual(LADDER[r] * 125 * 2 * 1.18);
    }
    expect(nominalSizes(LADDER, 15, 2, 7)).toEqual(s);
  });
});

describe('planStream config', () => {
  it('rejects nonsense', () => {
    expect(() => planStream(cfg('fiber', { loss: 2 }))).toThrow(RangeError);
    expect(() => planStream(cfg('fiber', { ladderKbps: [1200, 400, 2800, 5000] }))).toThrow(RangeError);
    expect(() => planStream(cfg('fiber', { segBytes: [[1]] }))).toThrow(RangeError);
    expect(() => planStream(cfg('fiber', { mss: 0 }))).toThrow(RangeError);
    expect(() => planStream(cfg('fiber', { rttEdge: 0 }))).toThrow(RangeError);
  });
});

describe('Criterion 1 — fibre', () => {
  it('starts in < 1.5 s after play, reaches 1080p within 4 segments and never stalls', () => {
    expect(fiber.playStart - ENCODE_S).toBeLessThan(1.5);
    const firstTop = done(fiber).findIndex((a) => a.rung === 3);
    expect(firstTop).toBeGreaterThanOrEqual(0);
    expect(firstTop).toBeLessThan(4);
    expect(fiber.stalls).toEqual([]);
  });
});

describe('Criterion 2 — tunnel', () => {
  it('stalls at least once, drops quality on the way back and climbs again', () => {
    expect(tunnel.stalls.length).toBeGreaterThanOrEqual(1);
    const rungs = done(tunnel).map((a) => a.rung);
    const before = Math.max(...rungs.slice(0, 4));
    const low = Math.min(...rungs.slice(4));
    expect(low).toBeLessThan(before);
    const lowAt = rungs.indexOf(low, 4);
    expect(Math.max(...rungs.slice(lowAt))).toBeGreaterThan(low);
  });
});

describe('drop (4–14 s at 1.5 Mbps)', () => {
  it('reaches 1080p, abandons it in the drop, falls back and climbs again without stalling', () => {
    const drop = planStream(cfg('drop'));
    expect(drop.attempts.some((a) => a.abandoned && a.rung === 3)).toBe(true);
    const rungs = done(drop).map((a) => a.rung);
    const lowAt = rungs.indexOf(Math.min(...rungs.slice(3)), 3);
    expect(rungs[lowAt]).toBeLessThan(3);
    expect(Math.max(...rungs.slice(lowAt))).toBeGreaterThan(rungs[lowAt]);
    expect(drop.stalls).toEqual([]);
  });
});

describe('Criterion 8 — determinism', () => {
  it('same config → same plan; another seed changes the losses', () => {
    const c = cfg('lte', { loss: 0.01 });
    expect(planStream(c)).toEqual(planStream(c));
    expect(planStream({ ...c, seed: 8 }).losses).not.toEqual(planStream(c).losses);
  });
});

describe('invariants', () => {
  const all = (['fiber', 'lte', 'drop', 'tunnel'] as const).flatMap((p) => [0, 0.01, 0.05].map((loss) => planStream(cfg(p, { loss }))));

  it('every plan plays the whole video, each segment exactly once', () => {
    for (const p of all) {
      expect(done(p).map((a) => a.seg)).toEqual(Array.from({ length: 15 }, (_, i) => i));
      expect(p.samples.at(-1)?.playhead).toBeCloseTo(30);
    }
  });

  it('the buffer stays within [0, top target + one segment]', () => {
    for (const p of all) for (const s of p.samples) {
      expect(s.buffer).toBeGreaterThanOrEqual(0);
      expect(s.buffer).toBeLessThanOrEqual(BUFFER_TIME_AT_TOP_QUALITY_S + 2);
    }
  });

  it('the playhead never passes what was downloaded', () => {
    for (const p of all) p.samples.forEach((s, i) => {
      const t = i * SAMPLE_S;
      expect(s.playhead).toBeLessThanOrEqual(done(p).filter((a) => a.done <= t + 1e-9).length * 2 + 1e-6);
    });
  });

  it('stages start in order and events are sorted by time', () => {
    for (const p of all) {
      expect(p.stageStart).toHaveLength(STREAM_STAGES.length);
      for (let i = 1; i < p.stageStart.length; i++) expect(p.stageStart[i]).toBeGreaterThanOrEqual(p.stageStart[i - 1]);
      expect(p.stageStart[1]).toBe(ENCODE_S);
      for (let i = 1; i < p.events.length; i++) expect(p.events[i].t).toBeGreaterThanOrEqual(p.events[i - 1].t);
    }
  });

  it('a miss happens exactly when the edge holds no copy; the first request is always a miss', () => {
    for (const p of all) {
      expect(p.attempts[0].miss).toBe(true);
      for (const a of p.attempts) {
        const held = p.cache.some((c) => c.rung === a.rung && a.seg >= c.from && a.seg <= c.to && c.t < a.request);
        expect(a.miss).toBe(!held);
      }
    }
    expect(fiber.attempts.some((a) => !a.miss)).toBe(true);
  });

  it('a stall lasts until the next segment arrives', () => {
    for (const p of all) for (const s of p.stalls) {
      expect(s.to).toBeGreaterThan(s.from);
      expect(done(p).some((a) => Math.abs(a.done - s.to) < 1e-9)).toBe(true);
    }
  });

  it('an abandoned request is re-requested for the same segment at a lower rung', () => {
    for (const p of all) p.attempts.forEach((a, i) => {
      if (!a.abandoned) return;
      const next = p.attempts[i + 1];
      expect(next.seg).toBe(a.seg);
      expect(next.rung).toBeLessThan(a.rung);
      expect(next.reason.rule).toBe('abandon');
    });
  });
});

describe('streamSnapshot', () => {
  it('is a pure lookup in the plan', () => {
    expect(streamSnapshot(tunnel, 17.3)).toEqual(streamSnapshot(tunnel, 17.3));
    expect(streamSnapshot(tunnel, 17.3).sample).toBe(tunnel.samples[Math.floor(17.3 / SAMPLE_S)]);
  });

  it('knows the stage', () => {
    expect(STREAM_STAGES[streamSnapshot(fiber, 0.5).stage]).toBe('encode');
    expect(STREAM_STAGES[streamSnapshot(fiber, ENCODE_S + 0.01).stage]).toBe('connect');
    expect(STREAM_STAGES[streamSnapshot(fiber, fiber.playStart + 1).stage]).toBe('playback');
    expect(STREAM_STAGES[streamSnapshot(fiber, fiber.end).stage]).toBe('end');
  });

  it('shows the request in flight with its phase and progress', () => {
    const a = fiber.attempts[0];
    expect(streamSnapshot(fiber, a.request + 0.001).download?.phase).toBe('request');
    expect(streamSnapshot(fiber, a.request + fiber.config.rttEdge).download?.phase).toBe('origin');
    const mid = streamSnapshot(fiber, (a.firstByte + a.done) / 2).download;
    expect(mid?.phase).toBe('transfer');
    expect(mid?.progress).toBeCloseTo(0.5);
    expect(streamSnapshot(fiber, 0.5).download).toBeNull();
  });

  it('clamps t and reports the rung under the playhead', () => {
    expect(streamSnapshot(fiber, -5).t).toBe(0);
    expect(streamSnapshot(fiber, 1e6).t).toBe(fiber.end);
    expect(streamSnapshot(fiber, 0.5).playingRung).toBe(-1);
    expect(streamSnapshot(fiber, fiber.end).playingRung).toBe(done(fiber)[14].rung);
    expect(streamSnapshot(fiber, fiber.end).completed).toHaveLength(15);
  });
});
