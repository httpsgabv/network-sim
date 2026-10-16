import { describe, expect, it } from 'vitest';
import { addSample, estimate, newEwma } from '../../src/sim/stream/ewma';

const feed = (samples: [kbps: number, ms: number][]) => samples.reduce((e, [k, ms]) => addSample(e, k, ms), newEwma());

describe('throughput EWMA (dash.js ThroughputModel/ThroughputController)', () => {
  it('has no estimate before the first sample', () => {
    expect(estimate(newEwma())).toBeNaN();
  });

  it('the startup correction makes a single sample its own estimate', () => {
    expect(estimate(feed([[3000, 800]]))).toBeCloseTo(3000);
  });

  it('a steady rate converges to that rate', () => {
    expect(estimate(feed(Array.from({ length: 10 }, () => [2000, 1000] as [number, number])))).toBeCloseTo(2000);
  });

  it('after a drop the fast estimate wins (min of fast and slow), so it reacts quickly but not fully', () => {
    const e = feed([[5000, 1000], [5000, 1000], [5000, 1000], [1000, 1000]]);
    const v = estimate(e);
    expect(v).toBeGreaterThan(1000);
    expect(v).toBeLessThan(4000);
  });

  it('after a rise the slow estimate wins, so it is cautious going up', () => {
    const up = estimate(feed([[1000, 1000], [1000, 1000], [5000, 1000]]));
    const down = estimate(feed([[5000, 1000], [5000, 1000], [1000, 1000]]));
    expect(up - 1000).toBeLessThan(5000 - down);
  });

  it('weighs each sample by its download time', () => {
    const shortNew = estimate(feed([[1000, 2000], [5000, 100]]));
    const longNew = estimate(feed([[1000, 2000], [5000, 3000]]));
    expect(longNew).toBeGreaterThan(shortNew);
  });
});
