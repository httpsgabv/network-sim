import { describe, expect, it } from 'vitest';
import { EARTH_KM, findRoute } from '../src/sim/route';
import { NODES } from '../src/data/nodes';
import { CABLES } from '../src/data/cables';

const route = findRoute(NODES, CABLES, 'sao', 'tyo');
const close = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

describe('findRoute', () => {
  it('finds the shortest SP → Tóquio path through the cable graph', () => {
    expect(route.hops).toEqual(['sao', 'fza', 'sin', 'mrs', 'bom', 'sgp', 'hkg', 'tyo']);
    expect(route.legs.map((l) => l.cable)).toEqual(['backbone-br', 'ellalink', 'backbone-eu', 'smw6', 'smw6', 'sjc2', 'sjc2']);
  });

  it('total length is plausible for that path', () => {
    const km = route.length * EARTH_KM;
    expect(km).toBeGreaterThan(24000);
    expect(km).toBeLessThan(32000);
  });

  it('works in reverse and between any two nodes', () => {
    expect(findRoute(NODES, CABLES, 'tyo', 'sao').hops.at(-1)).toBe('sao');
    for (const a of NODES) for (const b of NODES) {
      if (a.id !== b.id) expect(findRoute(NODES, CABLES, a.id, b.id).hops.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('throws for unknown or unreachable nodes', () => {
    expect(() => findRoute(NODES, CABLES, 'sao', 'nope')).toThrow();
    expect(() => findRoute([...NODES, { id: 'ilha', name: 'Ilha', kind: 'cdn', at: [0, 0] }], CABLES, 'sao', 'ilha')).toThrow();
  });
});

describe('route.posAt', () => {
  it('starts at the origin and ends at the destination, on the ground', () => {
    const start = route.posAt(0), end = route.posAt(1);
    expect(close(start.at, [-23.55, -46.63])).toBe(true);
    expect(close(end.at, [35.68, 139.69])).toBe(true);
    expect(start.h).toBe(0);
    expect(end.h).toBeCloseTo(0, 9);
  });

  it('hops arc above the surface: zero at each node, peak mid-leg', () => {
    for (const leg of route.legs) {
      const mid = route.posAt((leg.from + leg.length / 2) / route.length);
      expect(mid.h, leg.cable).toBeGreaterThan(0);
      expect(mid.h).toBeLessThanOrEqual(0.09);
      expect(route.posAt(leg.from / route.length).h).toBeCloseTo(0, 9);
    }
  });

  it('reports which leg a position is on, and clamps out-of-range input', () => {
    expect(route.posAt(0.5).leg).toBeGreaterThan(0);
    expect(route.posAt(-1)).toEqual(route.posAt(0));
    expect(route.posAt(2)).toEqual(route.posAt(1));
  });

  it('progress is continuous (no jumps between samples)', () => {
    let prev = route.posAt(0).at;
    for (let i = 1; i <= 500; i++) {
      const cur = route.posAt(i / 500).at;
      const dLat = cur[0] - prev[0];
      const dLon = ((cur[1] - prev[1] + 540) % 360) - 180;
      expect(Math.hypot(dLat, dLon)).toBeLessThan(2);
      prev = cur;
    }
  });
});
