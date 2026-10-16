import { describe, expect, it } from 'vitest';
import { NODES } from '../src/data/nodes';
import { BACKBONES, BACKHAUL_KM, backhaul } from '../src/data/cables';
import { NETWORK_NODES, nodeById } from '../src/data/network';
import { CABLE_DATA as real } from '../src/data/cableData';
import { km } from '../scripts/lib/cables.ts';

const validLatLon = ([lat, lon]: readonly [number, number]) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

describe('data', () => {
  it('city ids are unique and coordinates valid', () => {
    expect(new Set(NODES.map((n) => n.id)).size).toBe(NODES.length);
    expect(NODES.every((n) => validLatLon(n.at))).toBe(true);
  });

  it('network ids are unique: no city collides with a landing station', () => {
    expect(nodeById.size).toBe(NETWORK_NODES.length);
  });

  it('every backbone lands on known nodes, at both ends', () => {
    for (const cable of BACKBONES) {
      expect(typeof cable.path[0], cable.id).toBe('string');
      expect(typeof cable.path.at(-1), cable.id).toBe('string');
      cable.path.filter((p): p is string => typeof p === 'string').forEach((id) => expect(nodeById.has(id), `${cable.id} → ${id}`).toBe(true));
      cable.path.filter((p) => typeof p !== 'string').forEach((p) => expect(validLatLon(p as [number, number])).toBe(true));
    }
  });

  it('backhaul links each city to landing stations within 1 500 km only', () => {
    const links = backhaul(NODES, NETWORK_NODES.filter((n) => n.kind === 'landing'));
    for (const c of NODES) expect(links.some((l) => l.path[0] === c.id), c.id).toBe(true);
    for (const l of links) expect(km(nodeById.get(l.path[0] as string)!.at, nodeById.get(l.path[1] as string)!.at)).toBeLessThanOrEqual(BACKHAUL_KM);
  });
});

describe('cables.json (generated from TeleGeography 2022, CC BY-NC-SA 3.0)', () => {
  it('records its source and license, and stays within the 1.5 MB budget', () => {
    expect(real.license).toBe('CC BY-NC-SA 3.0 Unported');
    expect(real.source).toMatch(/TeleGeography/);
    // the generator writes JSON.stringify(data), so this is the file size
    expect(JSON.stringify(real).length).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  });

  it('cable ids are unique and real systems are there', () => {
    const ids = real.cables.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['monet', 'seabras-1', 'ellalink', 'marea', 'faster', 'jupiter', '2africa', 'grace-hopper']) expect(ids, id).toContain(id);
  });

  it('flags cables that were still planned in the 2022 snapshot', () => {
    const byId = new Map(real.cables.map((c) => [c.id, c]));
    expect(byId.get('2africa')?.planned).toBe(true);
    expect(byId.get('monet')?.planned).toBe(false);
    expect(real.cables.filter((c) => c.planned).every((c) => c.rfs !== null && c.rfs <= 2026)).toBe(true);
  });

  it('every leg joins two different landings of its own cable, starting and ending at them', () => {
    for (const c of real.cables) {
      expect(c.legs.length, c.id).toBeGreaterThan(0);
      for (const l of c.legs) {
        expect(l.a, c.id).not.toBe(l.b);
        expect(c.landings, c.id).toContain(l.a);
        expect(c.landings, c.id).toContain(l.b);
        expect(l.points.length, c.id).toBeGreaterThanOrEqual(2);
        expect(l.points.every(validLatLon), c.id).toBe(true);
        // snapped to the drawing within 50 km (+ rounding)
        expect(km(l.points[0], real.landings[l.a].at), `${c.id} ${l.a}`).toBeLessThan(52);
        expect(km(l.points.at(-1)!, real.landings[l.b].at), `${c.id} ${l.b}`).toBeLessThan(52);
      }
    }
  });
});
