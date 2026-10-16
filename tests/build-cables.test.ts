import { describe, expect, it } from 'vitest';
import { cableGraph, isActive, km, simplify, snapLanding, splitLegs } from '../scripts/lib/cables.ts';
import type { LatLon } from '../src/sim/types';

describe('simplify (Douglas–Peucker on the sphere)', () => {
  it('keeps both ends and drops points within tolerance', () => {
    const line: LatLon[] = [[0, 0], [0.01, 2], [-0.01, 4], [0, 6]];
    expect(simplify(line, 5)).toEqual([[0, 0], [0, 6]]);
  });

  it('keeps a point that deviates more than the tolerance', () => {
    const line: LatLon[] = [[0, 0], [1, 3], [0, 6]]; // ~111 km off the chord
    expect(simplify(line, 50)).toEqual(line);
    expect(simplify(line, 200)).toEqual([[0, 0], [0, 6]]);
  });

  it('leaves 2-point lines alone', () => {
    expect(simplify([[0, 0], [0, 1]], 100)).toEqual([[0, 0], [0, 1]]);
  });
});

describe('isActive', () => {
  it('needs a ready-for-service year that already passed and not planned', () => {
    expect(isActive({ rfsYear: 2017, planned: false }, 2026)).toBe(true);
    expect(isActive({ rfsYear: 2026, planned: false }, 2026)).toBe(true);
    expect(isActive({ rfsYear: 2028, planned: false }, 2026)).toBe(false);
    expect(isActive({ rfsYear: 2020, planned: true }, 2026)).toBe(false);
    expect(isActive({ rfsYear: null, planned: false }, 2026)).toBe(false);
  });

  it('can accept cables that were planned in an old snapshot, up to a year', () => {
    expect(isActive({ rfsYear: 2024, planned: true }, 2022, 2026)).toBe(true);
    expect(isActive({ rfsYear: 2027, planned: true }, 2022, 2026)).toBe(false);
    expect(isActive({ rfsYear: 2025, planned: false }, 2022, 2026)).toBe(false); // not planned yet future: bad data
  });
});

describe('cableGraph + snapLanding', () => {
  it('merges line ends that touch (branching units) within ~1 km', () => {
    const g = cableGraph([[[0, 0], [0, 5]], [[0.002, 5.002], [5, 10]]]);
    expect(g.verts).toHaveLength(3);
  });

  it('snaps a landing to the nearest vertex, or refuses beyond the limit', () => {
    const g = cableGraph([[[0, 0], [0, 5], [0, 10]]]);
    expect(snapLanding(g, [0.1, 5])).toEqual({ v: 1, km: expect.closeTo(11.1, 0) });
    expect(snapLanding(g, [10, 0])).toBeNull();
  });
});

describe('splitLegs', () => {
  const at = (id: string, p: LatLon) => ({ id, at: p });

  it('cuts a straight cable with 3 landings into 2 legs between neighbours', () => {
    const { legs, skipped } = splitLegs([[[0, 0], [0, 2.5], [0, 5], [0, 10]]], [at('a', [0, 0]), at('c', [0, 10]), at('b', [0, 5])]);
    expect(skipped).toEqual([]);
    expect(legs.map((l) => [l.a, l.b].sort().join('-')).sort()).toEqual(['a-b', 'b-c']);
    const ab = legs.find((l) => [l.a, l.b].sort().join() === 'a,b')!;
    expect(ab.points).toHaveLength(3); // goes through the drawing vertex at [0, 2.5]
  });

  it('turns a Y (branching unit) with 3 landings into 3 legs through the junction', () => {
    const { legs } = splitLegs(
      [[[0, 0], [0, 5]], [[0, 5], [5, 10]], [[0, 5], [-5, 10]]],
      [at('w', [0, 0]), at('n', [5, 10]), at('s', [-5, 10])],
    );
    expect(legs).toHaveLength(3);
    for (const l of legs) expect(l.points).toContainEqual([0, 5]);
  });

  it('skips landings far from the drawn path instead of inventing geometry', () => {
    const { legs, skipped } = splitLegs([[[0, 0], [0, 10]]], [at('a', [0, 0]), at('b', [0, 10]), at('far', [20, 5])]);
    expect(skipped).toEqual(['far']);
    expect(legs).toHaveLength(1);
  });

  it('leg points start at a and end at b', () => {
    const { legs } = splitLegs([[[0, 0], [0, 4], [0, 8]]], [at('a', [0, 0]), at('b', [0, 8])]);
    const [l] = legs;
    expect(l.points[0]).toEqual(l.a === 'a' ? [0, 0] : [0, 8]);
    expect(l.points.at(-1)).toEqual(l.b === 'b' ? [0, 8] : [0, 0]);
  });
});

describe('km', () => {
  it('measures great-circle distance', () => {
    expect(km([0, 0], [0, 1])).toBeCloseTo(111.19, 1);
  });
});
