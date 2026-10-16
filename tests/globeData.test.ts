import { describe, expect, it } from 'vitest';
import { cableMesh, nearestCable, segmentBuffer, toXYZ } from '../src/lib/globe';
import { cableRuns, globeLabels } from '../src/lib/describe';
import { NETWORK_CABLES, NETWORK_NODES, cableById } from '../src/data/network';
import { findRoute } from '../src/sim/route';

const route = (a: string, b: string) => findRoute(NETWORK_NODES, NETWORK_CABLES, a, b);

describe('segmentBuffer (the whole cable mesh in one LineSegments)', () => {
  it('emits vertex pairs at radius r, sampling long spans', () => {
    const buf = segmentBuffer([[[0, 0], [0, 3.6]], [[10, 10], [10, 11]]], 2, 1.5);
    // 3.6° at 1.5° steps = 3 segments; 1° = 1 segment → 4 segments × 2 vertices × 3 floats
    expect(buf).toHaveLength(4 * 2 * 3);
    for (let i = 0; i < buf.length; i += 3) expect(Math.hypot(buf[i], buf[i + 1], buf[i + 2])).toBeCloseTo(2, 6);
  });

  it('skips lines with fewer than two points', () => {
    expect(segmentBuffer([[[0, 0]]], 1)).toHaveLength(0);
  });
});

describe('cableRuns (one label per stretch of the same submarine cable)', () => {
  it('merges consecutive legs of the same cable and skips land links', () => {
    const r = route('sao', 'mia');
    const runs = cableRuns(r);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) expect(cableById.has(run.cable)).toBe(true);
    // no two neighbouring runs share a cable
    for (let i = 1; i < runs.length; i++) expect(runs[i].cable === runs[i - 1].cable && runs[i].first === runs[i - 1].last + 1).toBe(false);
    for (const run of runs) expect(run.name).toBe(cableById.get(run.cable)!.name);
  });

  it('places the label on the run itself, between its ends', () => {
    const r = route('lax', 'syd');
    const [run] = cableRuns(r);
    const leg = r.legs[run.first];
    const s = (leg.from + leg.length / 2) / r.length;
    expect(run.at).toEqual(r.posAt(s).at);
  });
});

describe('globeLabels', () => {
  it('labels every city, plus the landing stations of the route that are not next to a city', () => {
    const r = route('sao', 'tyo');
    const labels = globeLabels(r);
    expect(labels.filter((l) => l.kind === 'city')).toHaveLength(15);
    const landings = labels.filter((l) => l.kind === 'landing');
    expect(landings.length).toBeGreaterThan(0);
    // "Fortaleza" the landing sits 3 km from Fortaleza the city: only the city is labelled
    expect(landings.map((l) => l.text)).not.toContain('Fortaleza');
    expect(labels.filter((l) => l.kind === 'cable').map((l) => l.text)).toEqual(cableRuns(r).map((c) => c.name));
  });

  it('keys are unique and stable for React', () => {
    const keys = globeLabels(route('sao', 'tyo')).map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('cableMesh + nearestCable (picking a cable on the globe)', () => {
  const mesh = cableMesh([
    { id: 'equator', lines: [[[0, 0], [0, 20]]] },
    { id: 'meridian', lines: [[[10, 40], [30, 40]]] },
  ], 1);

  it('keeps one owner per segment, in buffer order', () => {
    expect(mesh.owners.length * 6).toBe(mesh.positions.length);
    expect(mesh.owners[0]).toBe('equator');
    expect(mesh.owners.at(-1)).toBe('meridian');
  });

  it('returns the cable under the click, or nothing when it is too far', () => {
    expect(nearestCable(mesh, toXYZ([0.3, 10]), 0.02)).toBe('equator');
    expect(nearestCable(mesh, toXYZ([20, 40.5]), 0.02)).toBe('meridian');
    expect(nearestCable(mesh, toXYZ([-40, -100]), 0.02)).toBeNull();
  });
});
