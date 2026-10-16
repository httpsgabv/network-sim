import { describe, expect, it } from 'vitest';
import { ENCODE_S, SAMPLE_S } from '../../src/sim/stream/engine';
import { qoeAt } from '../../src/sim/stream/qoe';
import type { Attempt, Sample, StreamPlan } from '../../src/sim/stream/types';

const LADDER = [400, 1200, 2800, 5000];
const attempt = (seg: number, rung: number, done: number, abandoned = false): Attempt => ({
  seg, rung, request: done - 0.5, firstByte: done - 0.4, done, bytesTotal: 1, bytesLoaded: 1, miss: false,
  reason: { rule: 'throughput' }, bufferAtDecision: 0, cwndStart: 10, cwndEnd: 10, losses: 0, abandoned, kbps: 1,
});
const sample = (playhead: number): Sample => ({ bwMbps: 1, buffer: 0, playhead, stalled: false, thrKbps: 1, estKbps: 1, cwnd: 10, bola: false });

// Hand-built: 4 segments, a 2 s stall from 6 s, segment 2 abandoned at 1080p then fetched at 240p.
const plan = {
  config: { ladderKbps: LADDER, segDur: 2 },
  attempts: [attempt(0, 0, 3), attempt(1, 2, 4), attempt(2, 3, 5, true), attempt(2, 0, 8), attempt(3, 1, 9)],
  stalls: [{ from: 6, to: 8 }],
  samples: Array.from({ length: 121 }, (_, i) => sample(Math.max(0, Math.min(8, i * SAMPLE_S - 3)))),
  playStart: 3,
} as unknown as StreamPlan;

describe('qoeAt', () => {
  it('before playback: nothing measured yet', () => {
    expect(qoeAt(plan, 2)).toEqual({ startupS: null, stalls: 0, stallS: 0, avgKbps: null, switches: 0 });
  });

  it('counts startup from the play press, an ongoing stall up to t, and only played segments in the average', () => {
    const q = qoeAt(plan, 7);
    expect(q.startupS).toBeCloseTo(3 - ENCODE_S);
    expect(q.stalls).toBe(1);
    expect(q.stallS).toBeCloseTo(1);
    // playhead 4 s → segments 0 and 1 played: (400 + 2800) / 2
    expect(q.avgKbps).toBe(1600);
    // 240p → 720p; the abandoned 1080p attempt is not a switch the viewer saw
    expect(q.switches).toBe(1);
  });

  it('at the end', () => {
    const q = qoeAt(plan, 12);
    expect(q.stallS).toBeCloseTo(2);
    expect(q.avgKbps).toBe((400 + 2800 + 400 + 1200) / 4);
    expect(q.switches).toBe(3);
  });
});
