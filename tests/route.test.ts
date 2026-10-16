import { describe, expect, it } from 'vitest';
import { findRoute, msPerTick, routeKm, TERRESTRIAL_DETOUR } from '../src/sim/route';
import { CITIES } from '../src/data/nodes';
import { NETWORK_CABLES, NETWORK_NODES, cableName, nodeById } from '../src/data/network';
import { CABLE_DATA } from '../src/data/cableData';
import type { Cable } from '../src/data/cables';
import type { NetNode } from '../src/data/nodes';

const route = (a: string, b: string) => findRoute(NETWORK_NODES, NETWORK_CABLES, a, b);
const oneWayMs = (a: string, b: string) => 100 * msPerTick(routeKm(route(a, b)));
const spTyo = route('sao', 'tyo');
const submarine = new Set(CABLE_DATA.cables.map((c) => c.id));
const landing = new Set(Object.keys(CABLE_DATA.landings));

describe('findRoute on the real network (TeleGeography 2022 + backhaul)', () => {
  it('every pair of pickable cities has a route that starts and ends at the cities', () => {
    expect(CITIES).toHaveLength(15);
    for (const a of CITIES) for (const b of CITIES) {
      if (a === b) continue;
      const r = route(a.id, b.id);
      expect(r.hops[0]).toBe(a.id);
      expect(r.hops.at(-1)).toBe(b.id);
    }
  });

  it('every leg is either a real cable between two real landings, or a land link', () => {
    for (const a of CITIES) for (const b of CITIES) {
      if (a === b) continue;
      for (const leg of route(a.id, b.id).legs) {
        if (submarine.has(leg.cable)) {
          expect(landing.has(leg.a) && landing.has(leg.b), `${leg.cable}: ${leg.a} → ${leg.b}`).toBe(true);
        } else {
          expect(NETWORK_CABLES.find((c) => c.id === leg.cable)?.kind, leg.cable).toBe('terrestrial');
        }
      }
    }
  });

  it('São Paulo → Tóquio crosses at least two oceans on real cables', () => {
    const cables = spTyo.legs.filter((l) => submarine.has(l.cable));
    expect(cables.length).toBeGreaterThanOrEqual(2);
    for (const l of cables) expect(cableName(l.cable)).not.toBe(l.cable); // names come from the dataset
  });

  it('one-way latency is in line with real measurements', () => {
    expect(oneWayMs('sao', 'tyo')).toBeGreaterThan(110);
    expect(oneWayMs('sao', 'tyo')).toBeLessThan(160);
    expect(oneWayMs('lon', 'fra')).toBeLessThan(10);
    expect(oneWayMs('sao', 'mia')).toBeGreaterThan(35);
    expect(oneWayMs('sao', 'mia')).toBeLessThan(60);
  });

  it('throws for unknown nodes', () => {
    expect(() => route('sao', 'nope')).toThrow();
  });
});

describe('findRoute (small graph)', () => {
  const n = (id: string, at: [number, number]): NetNode => ({ id, name: id, kind: 'cdn', at });
  const nodes = [n('a', [0, 0]), n('b', [0, 10]), n('c', [0, 20]), n('d', [10, 10]), n('island', [-40, 0])];
  const sea = (id: string, path: Cable['path']): Cable => ({ id, name: id, kind: 'submarine', path });

  it('picks the shortest path, not the fewest hops', () => {
    const cables = [sea('direct-detour', ['a', [30, 10], 'c']), sea('ab', ['a', 'b']), sea('bc', ['b', 'c'])];
    expect(findRoute(nodes, cables, 'a', 'c').hops).toEqual(['a', 'b', 'c']);
  });

  it('charges land links the detour factor, so equal sea beats land', () => {
    const cables: Cable[] = [
      sea('sea', ['a', 'b']),
      { id: 'land', name: 'land', kind: 'terrestrial', path: ['a', 'b'] },
    ];
    expect(findRoute(nodes, cables, 'a', 'b').legs[0].cable).toBe('sea');
    const landOnly = findRoute(nodes, [cables[1]], 'a', 'b');
    expect(landOnly.length).toBeCloseTo(findRoute(nodes, [cables[0]], 'a', 'b').length * TERRESTRIAL_DETOUR, 9);
  });

  it('a cable path with waypoints is one leg between its two nodes', () => {
    const r = findRoute(nodes, [sea('bent', ['a', [5, 5], 'b']), sea('bd', ['b', 'd'])], 'a', 'd');
    expect(r.hops).toEqual(['a', 'b', 'd']);
    expect(r.legs[0].points).toHaveLength(3);
  });

  it('throws when unreachable', () => {
    expect(() => findRoute(nodes, [sea('ab', ['a', 'b'])], 'a', 'island')).toThrow();
  });
});

describe('msPerTick', () => {
  it('scales with distance: twice the km, twice the ms', () => {
    expect(msPerTick(20000)).toBeCloseTo(2 * msPerTick(10000), 12);
  });

  it('London → Frankfurt is far quicker than São Paulo → Tóquio', () => {
    expect(oneWayMs('lon', 'fra')).toBeLessThan(oneWayMs('sao', 'tyo') / 10);
  });
});

describe('route.posAt', () => {
  const close = (a: readonly [number, number], b: readonly [number, number]) =>
    Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

  it('starts at the origin and ends at the destination', () => {
    expect(close(spTyo.posAt(0).at, nodeById.get('sao')!.at)).toBe(true);
    expect(close(spTyo.posAt(1).at, nodeById.get('tyo')!.at)).toBe(true);
  });

  it('packets ride on the cable: no altitude anywhere', () => {
    for (let i = 0; i <= 200; i++) expect(spTyo.posAt(i / 200).h).toBe(0);
  });

  it('reports which leg a position is on, and clamps out-of-range input', () => {
    expect(spTyo.posAt(0.5).leg).toBeGreaterThan(0);
    expect(spTyo.posAt(-1)).toEqual(spTyo.posAt(0));
    expect(spTyo.posAt(2)).toEqual(spTyo.posAt(1));
  });

  it('progress is continuous (no jumps between samples)', () => {
    let prev = spTyo.posAt(0).at;
    for (let i = 1; i <= 1000; i++) {
      const cur = spTyo.posAt(i / 1000).at;
      const dLat = cur[0] - prev[0];
      const dLon = (((cur[1] - prev[1] + 540) % 360) - 180) * Math.cos((cur[0] * Math.PI) / 180);
      expect(Math.hypot(dLat, dLon)).toBeLessThan(2);
      prev = cur;
    }
  });

  it('time on a land leg is stretched by the detour factor (fibre km, not straight km)', () => {
    const land = spTyo.legs.find((l) => !submarine.has(l.cable))!;
    expect(land).toBeDefined();
    const geometric = land.cum.at(-1)!;
    expect(land.length).toBeCloseTo(geometric * TERRESTRIAL_DETOUR, 9);
  });
});
