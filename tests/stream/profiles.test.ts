import { describe, expect, it } from 'vitest';
import { PROFILES, PROFILE_IDS } from '../../src/sim/stream/profiles';

const range = (from: number, to: number, step = 0.1) => Array.from({ length: Math.round((to - from) / step) }, (_, i) => from + i * step);

describe('network profiles (Kenji’s last mile, Mbps)', () => {
  it('has the four profiles in bar order', () => {
    expect(PROFILE_IDS).toEqual(['fiber', 'lte', 'drop', 'tunnel']);
    for (const id of PROFILE_IDS) expect(PROFILES[id].label).toBeTruthy();
  });

  it('fibre is a steady 50 Mbps', () => {
    expect(range(0, 60).every((x) => PROFILES.fiber.bwMbps(x, 7) === 50)).toBe(true);
  });

  it('drop: 20 → 1.5 between 4 s and 14 s → 20', () => {
    const bw = (x: number) => PROFILES.drop.bwMbps(x, 7);
    expect([bw(0), bw(3.99), bw(4), bw(13.99), bw(14), bw(40)]).toEqual([20, 20, 1.5, 1.5, 20, 20]);
  });

  it('tunnel: 8 Mbps, 0.1 Mbps from 10 s to 22 s', () => {
    const bw = (x: number) => PROFILES.tunnel.bwMbps(x, 7);
    expect([bw(5), bw(10), bw(21.9), bw(22), bw(30)]).toEqual([8, 0.1, 0.1, 8, 8]);
  });

  it('4G oscillates within 2–12 Mbps, deterministically per seed', () => {
    const a = range(0, 60).map((x) => PROFILES.lte.bwMbps(x, 7));
    expect(a.every((v) => v >= 2 && v <= 12)).toBe(true);
    expect(Math.min(...a)).toBeLessThan(4);
    expect(Math.max(...a)).toBeGreaterThan(9);
    expect(range(0, 60).map((x) => PROFILES.lte.bwMbps(x, 7))).toEqual(a);
    expect(range(0, 60).map((x) => PROFILES.lte.bwMbps(x, 8))).not.toEqual(a);
  });

  it('never returns zero or negative bandwidth', () => {
    for (const id of PROFILE_IDS) expect(range(0, 60).every((x) => PROFILES[id].bwMbps(x, 3) > 0)).toBe(true);
  });
});
