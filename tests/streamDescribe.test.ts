import { describe, expect, it } from 'vitest';
import { STREAM_ACTOR_GROUPS, streamActor } from '../src/lib/actors';
import { mbps, reasonText, streamHint } from '../src/lib/describe';
import { ENCODE_S, streamSnapshot, streamStageAt, streamStagePos, streamStageTime } from '../src/sim/stream/engine';
import { STREAM_STAGES } from '../src/sim/stream/types';
import { streamPlanFor } from '../src/store';

const drop = streamPlanFor('sao', 'tyo', 'drop', 0, 1024);
const tunnel = streamPlanFor('sao', 'tyo', 'tunnel', 0, 1024);
const hint = (p: typeof drop, t: number) => streamHint(p, streamSnapshot(p, t), 'sao', 'hkg');

describe('stage position ↔ time (scrubber, 100 per stage)', () => {
  it('maps every stage start to a multiple of 100 and back', () => {
    drop.stageStart.forEach((t, i) => {
      expect(streamStagePos(drop, t)).toBeCloseTo(i * 100);
      expect(streamStageTime(drop, i * 100)).toBeCloseTo(t);
    });
    expect(streamStagePos(drop, drop.end)).toBe(600);
    expect(streamStageTime(drop, 600)).toBe(drop.end);
  });

  it('is monotonic and round-trips inside a stage', () => {
    let last = -1;
    for (let t = 0; t <= drop.end; t += 0.37) {
      const pos = streamStagePos(drop, t);
      expect(pos).toBeGreaterThanOrEqual(last);
      expect(streamStageTime(drop, pos)).toBeCloseTo(t, 6);
      last = pos;
    }
  });

  it('knows the stage at t', () => {
    expect(STREAM_STAGES[streamStageAt(drop, 0)]).toBe('encode');
    expect(STREAM_STAGES[streamStageAt(drop, drop.end)]).toBe('end');
  });
});

describe('actors in Streaming', () => {
  it('A encodes, the network connects and fetches the manifest, B does the rest', () => {
    expect(STREAM_STAGES.map((_, i) => streamActor(i).key)).toEqual(['A', 'N', 'N', 'B', 'B', 'B']);
    expect(streamActor(0).label).toBe('A · Origem');
    expect(streamActor(4).label).toBe('B · Kenji');
    expect(STREAM_ACTOR_GROUPS.map((g) => g.stages.length).reduce((a, b) => a + b)).toBe(6);
  });
});

describe('mbps', () => {
  it('formats kbit/s the pt-BR way', () => {
    expect([mbps(400), mbps(2800), mbps(12_345), mbps(NaN)]).toEqual(['400 kbps', '2,8 Mbps', '12,3 Mbps', '—']);
  });
});

describe('reasonText (why this rung)', () => {
  it('explains each rule with its numbers', () => {
    expect(reasonText({ rule: 'throughput', safeKbps: 2950 }, 2)).toBe('Throughput: estimativa segura de 3,0 Mbps (× 0,9) → 720p');
    expect(reasonText({ rule: 'bola', bufferS: 13.24, placeholder: 0 }, 3)).toBe('BOLA: buffer de 13,2 s → 1080p');
    expect(reasonText({ rule: 'bola', bufferS: 12, placeholder: 2.5 }, 3)).toBe('BOLA: buffer de 12,0 s + 2,5 s virtuais → 1080p');
    expect(reasonText({ rule: 'insufficient-buffer', capKbps: 0, bufferS: 0 }, 0)).toBe('Buffer vazio: desce para 240p');
    expect(reasonText({ rule: 'insufficient-buffer', capKbps: 1750, bufferS: 1 }, 1)).toBe('Buffer curto (1,0 s): teto de 1,8 Mbps → 480p');
    expect(reasonText({ rule: 'switch-history' }, 1)).toBe('Histórico de trocas: a qualidade de cima caiu demais → 480p');
    expect(reasonText({ rule: 'abandon', safeKbps: 1029 }, 0)).toBe('Download lento demais (1,0 Mbps): abandonou e pediu em 240p');
    expect(reasonText({ rule: 'none' }, 0)).toBe('Sem medição ainda: estimativa inicial de 1.000 kbps → 240p');
  });
});

describe('streamHint (the stage subtitle)', () => {
  it('names the places in the opening stages', () => {
    expect(hint(drop, 1)).toMatch(/4 qualidades/);
    expect(hint(drop, ENCODE_S + 0.01)).toMatch(/Hong Kong/);
    expect(hint(drop, (drop.stageStart[2] + drop.stageStart[3]) / 2)).toMatch(/São Paulo/);
  });

  it('explains the decision of the segment downloading, a stall, and the end', () => {
    const a = drop.attempts[3];
    expect(hint(drop, (a.firstByte + a.done) / 2)).toMatch(/^Seg 04: /);
    const stall = tunnel.stalls[0];
    expect(hint(tunnel, (stall.from + stall.to) / 2)).toMatch(/Buffer vazio/);
    expect(hint(drop, drop.end)).toMatch(/até o fim/);
  });
});
