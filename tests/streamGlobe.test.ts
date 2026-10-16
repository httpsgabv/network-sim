import { describe, expect, it } from 'vitest';
import { burstMarks, streamFocus, streamGlobeLabels, streamPulse, streamRoutes } from '../src/lib/streamGlobe';
import { ENCODE_S, streamSnapshot } from '../src/sim/stream/engine';
import { streamPlanFor } from '../src/store';

const routes = streamRoutes('sao', 'tyo');
const fiber = streamPlanFor('sao', 'tyo', 'fiber', 0, 1024);
const tunnel = streamPlanFor('sao', 'tyo', 'tunnel', 0.01, 1024);
const snap = (p: typeof fiber, t: number) => streamSnapshot(p, t);
const firstMiss = fiber.attempts[0];
const missT = (firstMiss.request + firstMiss.firstByte) / 2;
const hit = fiber.attempts.find((a) => !a.miss)!;
const transferT = (hit.firstByte + hit.done) / 2;

describe('streamRoutes', () => {
  it('goes origin → CDN edge → viewer', () => {
    expect(routes.edge).toBe('hkg');
    expect(routes.toEdge.hops[0]).toBe('sao');
    expect(routes.toEdge.hops.at(-1)).toBe('hkg');
    expect(routes.toViewer.hops[0]).toBe('hkg');
    expect(routes.toViewer.hops.at(-1)).toBe('tyo');
  });
});

describe('streamFocus (camera target)', () => {
  it('origin while encoding, the origin → edge path on a miss, the edge → viewer path otherwise', () => {
    expect(streamFocus(snap(fiber, 1))).toEqual({ path: 'toEdge', s: 0 });
    expect(streamFocus(snap(fiber, missT))).toEqual({ path: 'toEdge', s: 0.5 });
    expect(streamFocus(snap(fiber, transferT))).toEqual({ path: 'toViewer', s: 0.5 });
    expect(streamFocus(snap(fiber, fiber.end))).toEqual({ path: 'toViewer', s: 0.5 });
  });

  it('follows the manifest to the origin', () => {
    const manifestT = (fiber.stageStart[2] + fiber.stageStart[3]) / 2;
    expect(streamFocus(snap(fiber, manifestT)).path).toBe('toEdge');
  });
});

describe('burstMarks (a visual sample of each segment’s packets)', () => {
  it('nothing flies while encoding', () => {
    expect(burstMarks(fiber, snap(fiber, 1))).toEqual([]);
  });

  it('a miss flies origin → edge', () => {
    const marks = burstMarks(fiber, snap(fiber, missT));
    expect(marks).toHaveLength(6);
    expect(marks.every((m) => m.path === 'toEdge' && m.kind === 'packet')).toBe(true);
  });

  it('a transfer flies edge → viewer, 3–10 dots by throughput, positions in [0, 1), deterministic', () => {
    const marks = burstMarks(fiber, snap(fiber, transferT));
    expect(marks.length).toBeGreaterThanOrEqual(3);
    expect(marks.length).toBeLessThanOrEqual(10);
    expect(marks.every((m) => m.path === 'toViewer' && m.s >= 0 && m.s < 1)).toBe(true);
    expect(burstMarks(fiber, snap(fiber, transferT))).toEqual(marks);
  });

  it('a loss shows a red mark and an amber resend for 0.6 s', () => {
    const l = tunnel.losses[0];
    const kinds = burstMarks(tunnel, snap(tunnel, l.t + 0.3)).map((m) => m.kind);
    expect(kinds).toContain('lost');
    expect(kinds).toContain('resend');
    expect(burstMarks(tunnel, snap(tunnel, l.t + 0.7)).map((m) => m.kind)).not.toContain('lost');
  });
});

describe('streamPulse', () => {
  it('pulses at the origin while encoding and at the viewer right after a segment lands', () => {
    expect(streamPulse(fiber, snap(fiber, 1))).toBe('origin');
    expect(streamPulse(fiber, snap(fiber, hit.done + 0.1))).toBe('viewer');
    expect(streamPulse(fiber, snap(fiber, ENCODE_S + 0.01))).toBeNull();
  });
});

describe('streamGlobeLabels', () => {
  it('names the edge as the CDN and labels both paths without duplicates', () => {
    const labels = streamGlobeLabels(routes);
    expect(labels.find((l) => l.key === 'city:hkg')?.text).toBe('Hong Kong · CDN');
    const keys = labels.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(labels.some((l) => l.kind === 'cable')).toBe(true);
  });
});
