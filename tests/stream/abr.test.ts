import { describe, expect, it } from 'vitest';
import {
  decide, minBufferLevelFor, newAbr, onAbandon, onBufferEmpty, onSegmentLoaded, optimalFor, shouldAbandon, updateDynamic,
  type AbandonIn, type AbrState, type DecideIn,
} from '../../src/sim/stream/abr';
import { bolaParams } from '../../src/sim/stream/dashjs';

const LADDER = [400, 1200, 2800, 5000];
const base: DecideIn = { ladder: LADDER, now: 10, buffer: 8, bufferEmpty: false, safeKbps: NaN, avgKbps: NaN, segDur: 2 };
const ready = (over: Partial<AbrState> = {}): AbrState => ({ ...newAbr(LADDER), ignoreCount: 0, ...over });

describe('optimalFor (AbrController.getOptimalRepresentationForBitrate)', () => {
  it('picks the highest rung at or below the target, else the lowest', () => {
    expect([optimalFor(LADDER, 3000), optimalFor(LADDER, 2800), optimalFor(LADDER, 399), optimalFor(LADDER, 0), optimalFor(LADDER, 9e9)]).toEqual([2, 2, 0, 0, 3]);
  });
});

describe('initial state', () => {
  it('starts on Throughput at the rung for the 1 000 kbps default estimate (240p here)', () => {
    const s = newAbr(LADDER);
    expect(s.bolaActive).toBe(false);
    expect(s.current).toBe(0);
    expect(newAbr(LADDER, 1500).current).toBe(1);
  });

  it('with no measurement and an empty buffer nothing asks to switch: keeps the current rung', () => {
    const d = decide(newAbr(LADDER), { ...base, buffer: 0, bufferEmpty: true });
    expect(d.index).toBe(0);
    expect(d.reason.rule).toBe('none');
  });
});

describe('Dynamic strategy (AbrController._updateDynamicAbrStrategy)', () => {
  it('switches to BOLA at ≥ 12 s and back only below 6 s', () => {
    const s0 = newAbr(LADDER);
    expect(updateDynamic(s0, 11.9).bolaActive).toBe(false);
    const on = updateDynamic(s0, 12);
    expect(on.bolaActive).toBe(true);
    expect(updateDynamic(on, 6).bolaActive).toBe(true);
    expect(updateDynamic(on, 5.9).bolaActive).toBe(false);
  });
});

describe('ThroughputRule', () => {
  it('with a loaded buffer picks the rung for the safe throughput', () => {
    const d = decide(ready(), { ...base, safeKbps: 3000, avgKbps: 3333 });
    expect(d.index).toBe(2);
    expect(d.reason).toMatchObject({ rule: 'throughput', safeKbps: 3000 });
  });

  it('asks for no change while the buffer is empty', () => {
    const d = decide(ready({ current: 1, ignoreCount: 2 }), { ...base, buffer: 0, bufferEmpty: true, safeKbps: 9000, avgKbps: 10000 });
    expect(d.index).toBe(1);
  });
});

describe('InsufficientBufferRule (minimum across rules)', () => {
  it('caps at avg × 0.7 × buffer / segment duration once 2 segments were appended', () => {
    // 5 000 × 0.7 × 1 / 2 = 1 750 kbps → 480p, while Throughput alone would say 720p
    const d = decide(ready(), { ...base, buffer: 1, safeKbps: 4500, avgKbps: 5000 });
    expect(d.index).toBe(1);
    expect(d.reason).toMatchObject({ rule: 'insufficient-buffer', capKbps: 1750 });
  });

  it('is ignored during the first 2 segments', () => {
    const d = decide(newAbr(LADDER), { ...base, buffer: 1, safeKbps: 4500, avgKbps: 5000 });
    expect(d.index).toBe(2);
  });

  it('drops to the lowest rung when the buffer is empty', () => {
    const d = decide(ready({ current: 3 }), { ...base, buffer: 0, bufferEmpty: true, safeKbps: 9000, avgKbps: 10000 });
    expect(d.index).toBe(0);
    expect(d.reason.rule).toBe('insufficient-buffer');
  });

  it('counts appended segments down from 2', () => {
    let s = newAbr(LADDER);
    s = onSegmentLoaded(s, { ladder: LADDER, now: 1, request: 0.5, durationS: 2, buffer: 2 });
    expect(s.ignoreCount).toBe(1);
    s = onSegmentLoaded(s, { ladder: LADDER, now: 2, request: 1.5, durationS: 2, buffer: 4 });
    s = onSegmentLoaded(s, { ladder: LADDER, now: 3, request: 2.5, durationS: 2, buffer: 6 });
    expect(s.ignoreCount).toBe(0);
  });
});

describe('SwitchHistoryRule', () => {
  it('caps below a rung that keeps dropping (drops / noDrops > 7.5 % over 8 decisions)', () => {
    const history = [...Array.from({ length: 7 }, () => ({ from: 2, drop: false })), { from: 2, drop: true }];
    const d = decide(ready({ current: 2, history }), { ...base, buffer: 10, safeKbps: 9000, avgKbps: 10000 });
    expect(d.index).toBe(1);
    expect(d.reason.rule).toBe('switch-history');
  });

  it('needs the full window before acting', () => {
    const history = [{ from: 2, drop: true }, { from: 2, drop: false }];
    expect(decide(ready({ current: 2, history }), { ...base, buffer: 10, safeKbps: 9000, avgKbps: 10000 }).index).toBe(3);
  });

  it('records each decision and keeps only the last 8', () => {
    let s = ready({ current: 3 });
    for (let i = 0; i < 10; i++) s = decide(s, { ...base, buffer: 10, safeKbps: 500, avgKbps: 600 }).state;
    expect(s.history).toHaveLength(8);
    expect(s.history[0]).toEqual({ from: 0, drop: false });
  });
});

describe('BolaRule (BOLA-O)', () => {
  const { utilities, gp, Vp } = bolaParams(LADDER);
  const score = (q: number, level: number) => (Vp * (utilities[q] - 1 + gp) - level) / LADDER[q];

  it('minBufferLevelFor(q) is where q starts to beat every lower rung', () => {
    for (const q of [1, 2, 3]) {
      const level = minBufferLevelFor(LADDER, q) + 1e-6;
      for (let i = 0; i < q; i++) expect(score(q, level)).toBeGreaterThanOrEqual(score(i, level));
    }
    expect(minBufferLevelFor(LADDER, 0)).toBe(0);
  });

  it('startup: chooses by throughput and sets the placeholder so BOLA agrees with that choice', () => {
    const d = decide(ready({ bolaActive: true }), { ...base, buffer: 12, safeKbps: 3000, avgKbps: 3333 });
    expect(d.index).toBe(2);
    expect(d.reason.rule).toBe('bola');
    expect(d.state.bola?.phase).toBe('startup');
    expect(d.state.bola?.placeholder).toBeCloseTo(Math.max(0, minBufferLevelFor(LADDER, 2) - 12));
  });

  it('becomes steady at the first startup decision after a segment loaded, if buffer ≥ its duration', () => {
    const s = decide(ready({ bolaActive: true }), { ...base, buffer: 12, safeKbps: 3000, avgKbps: 3333 }).state;
    const loaded = onSegmentLoaded(s, { ladder: LADDER, now: 11, request: 10, durationS: 2, buffer: 13 });
    expect(loaded.bola?.phase).toBe('startup');
    expect(decide(loaded, { ...base, now: 11, buffer: 13, safeKbps: 3000, avgKbps: 3333 }).state.bola?.phase).toBe('steady');
  });

  it('on each loaded segment the placeholder decays by 0.99 and is trimmed to the rung’s maximum', () => {
    const s = ready({ bolaActive: true, current: 3, bola: { phase: 'steady', placeholder: 2, lastSegDur: 2, lastFinish: null, lastCall: null } });
    expect(onSegmentLoaded(s, { ladder: LADDER, now: 11, request: 10, durationS: 2, buffer: 12 }).bola?.placeholder).toBeCloseTo(1.98);
    const max1080 = Vp * (utilities[3] + gp);
    // buffer at request time ≈ buffer + download time = 21 s; trims to max(0, max − 21)
    expect(onSegmentLoaded(s, { ladder: LADDER, now: 11, request: 10, durationS: 2, buffer: 20 }).bola?.placeholder).toBeCloseTo(Math.max(0, max1080 - 21));
  });

  const steady = (placeholder: number, current: number): AbrState =>
    ready({ bolaActive: true, current, bola: { phase: 'steady', placeholder, lastSegDur: 2, lastFinish: null, lastCall: null } });

  it('steady: a full buffer picks the top rung', () => {
    const d = decide(steady(0, 3), { ...base, buffer: 18, safeKbps: 9000, avgKbps: 10000 });
    expect(d.index).toBe(3);
  });

  it('BOLA-O never climbs above both the current rung and the throughput rung', () => {
    const d = decide(steady(0, 1), { ...base, buffer: 18, safeKbps: 1500, avgKbps: 1700 });
    expect(d.index).toBe(1);
  });

  it('a buffer above the rung’s maximum asks the scheduler to wait, spending the placeholder first', () => {
    // pinned to 480p by low throughput (BOLA-O), but the buffer is well above where BOLA would download 480p
    const d = decide(steady(1, 1), { ...base, buffer: 17, safeKbps: 1500, avgKbps: 1700 });
    const max480 = Vp * (utilities[1] + gp);
    expect(d.state.bola?.placeholder).toBe(0);
    expect(d.delayS).toBeCloseTo(17 + 1 - max480 - 1);
  });

  it('adds the wait since the last download to the placeholder', () => {
    const s = ready({ bolaActive: true, current: 3, bola: { phase: 'steady', placeholder: 0, lastSegDur: 2, lastFinish: 8, lastCall: null } });
    const d = decide(s, { ...base, now: 10, buffer: 13, safeKbps: 9000, avgKbps: 10000 });
    expect(d.reason).toMatchObject({ rule: 'bola', placeholder: expect.any(Number) });
    expect(d.state.bola?.lastFinish).toBeNull();
  });

  it('a buffer-empty event clears the placeholder (steady only)', () => {
    expect(onBufferEmpty(steady(4, 2)).bola?.placeholder).toBe(0);
  });
});

describe('AbandonRequestsRule', () => {
  const slow: AbandonIn = {
    ladder: LADDER, index: 3, buffer: 6, segDur: 2, rounds: 10, msSinceFirstByte: 800,
    bytesLoaded: 100_000, bytesTotal: 1_250_000, bytesAfterFirstTrace: 90_000, msAfterFirstTrace: 700, abandoned: false,
  };

  it('abandons a download that would take ≥ 1.8 × the segment and re-requests what the throughput affords', () => {
    // 90 kB in 0.7 s ≈ 1 029 kbps → 240p
    expect(shouldAbandon(slow)).toEqual({ index: 0, kbps: 1029 });
  });

  it('does not abandon with a buffer above bufferTimeDefault, at the lowest rung, twice, or too early', () => {
    expect(shouldAbandon({ ...slow, buffer: 19 })).toBeNull();
    expect(shouldAbandon({ ...slow, index: 0 })).toBeNull();
    expect(shouldAbandon({ ...slow, abandoned: true })).toBeNull();
    expect(shouldAbandon({ ...slow, rounds: 5 })).toBeNull();
    expect(shouldAbandon({ ...slow, msSinceFirstByte: 400 })).toBeNull();
    expect(shouldAbandon({ ...slow, bytesLoaded: slow.bytesTotal })).toBeNull();
  });

  it('keeps a download that will finish in time', () => {
    expect(shouldAbandon({ ...slow, bytesAfterFirstTrace: 900_000 })).toBeNull();
  });

  it('keeps it when what is left is already less than the whole segment at the affordable rung', () => {
    expect(shouldAbandon({ ...slow, bytesLoaded: 1_200_000 })).toBeNull();
  });

  it('after an abandon (AbrController._onSegmentDownloadShouldBeAbandoned): new rung, history reset, BOLA deflated', () => {
    const history = [{ from: 3, drop: false }];
    const s = ready({ bolaActive: true, current: 3, history, bola: { phase: 'steady', placeholder: 20, lastSegDur: 2, lastFinish: null, lastCall: null } });
    const a = onAbandon(s, { ladder: LADDER, index: 1, buffer: 6, now: 30 });
    expect(a.current).toBe(1);
    expect(a.history).toEqual([]);
    // quality changes first, so the deflation targets the NEW rung
    expect(a.bola?.placeholder).toBeCloseTo(Math.max(0, minBufferLevelFor(LADDER, 1) - 6));
    // to the lowest rung it deflates to BOLA's minimum buffer instead
    expect(onAbandon(s, { ladder: LADDER, index: 0, buffer: 6, now: 30 }).bola?.placeholder).toBe(4);
  });

  it('for 10 s after an abandon only down-switches are allowed and Throughput stays quiet', () => {
    const a = onAbandon(ready({ current: 3 }), { ladder: LADDER, index: 0, buffer: 6, now: 30 });
    expect(decide(a, { ...base, now: 35, buffer: 10, safeKbps: 9000, avgKbps: 10000 }).index).toBe(0);
    expect(decide(a, { ...base, now: 40, buffer: 10, safeKbps: 9000, avgKbps: 10000 }).index).toBe(3);
  });
});
