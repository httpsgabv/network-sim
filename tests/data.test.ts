import { describe, expect, it } from 'vitest';
import { NODES, nodeById } from '../src/data/nodes';
import { CABLES } from '../src/data/cables';

const validLatLon = ([lat, lon]: readonly [number, number]) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

describe('data', () => {
  it('node ids are unique and coordinates valid', () => {
    expect(new Set(NODES.map((n) => n.id)).size).toBe(NODES.length);
    expect(NODES.every((n) => validLatLon(n.at))).toBe(true);
  });

  it('every cable lands on known nodes, at both ends', () => {
    for (const cable of CABLES) {
      const landings = cable.path.filter((p): p is string => typeof p === 'string');
      expect(landings.length, cable.id).toBeGreaterThanOrEqual(2);
      expect(typeof cable.path[0], cable.id).toBe('string');
      expect(typeof cable.path.at(-1), cable.id).toBe('string');
      landings.forEach((id) => expect(nodeById.has(id), `${cable.id} → ${id}`).toBe(true));
      cable.path.filter((p) => typeof p !== 'string').forEach((p) => expect(validLatLon(p as [number, number])).toBe(true));
    }
  });

  it('every node is reachable by some cable', () => {
    const landed = new Set(CABLES.flatMap((c) => c.path.filter((p) => typeof p === 'string')));
    expect(NODES.filter((n) => !landed.has(n.id)).map((n) => n.id)).toEqual([]);
  });
});
