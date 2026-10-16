// Pure helpers for `npm run data:cables`: turn TeleGeography's drawn cable lines into
// legs between real landing stations. Plain TS with erasable syntax only, so Node runs it directly.
import { angle, toVec, type Vec3 } from '../../src/sim/geo.ts';
import type { LatLon } from '../../src/sim/types';

const EARTH_KM = 6371;
/** Line ends closer than this are the same point (TeleGeography draws branches as separate lines). */
const MERGE_KM = 1;
/** A landing farther than this from its cable's drawing is not routed on that cable. */
const SNAP_KM = 50;

export const km = (a: LatLon, b: LatLon) => angle(toVec(a), toVec(b)) * EARTH_KM;

/** Distance (km) from p to the great circle through a and b. */
function crossTrackKm(p: Vec3, a: Vec3, b: Vec3): number {
  const n: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = Math.hypot(...n);
  if (len < 1e-12) return angle(p, a) * EARTH_KM;
  return Math.abs(Math.asin((p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) / len)) * EARTH_KM;
}

/** Douglas–Peucker with cross-track distance; always keeps both ends. */
export function simplify(points: LatLon[], tolKm: number): LatLon[] {
  if (points.length < 3) return points;
  const v = points.map(toVec);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let worst = -1, far = 0;
    for (let k = i + 1; k < j; k++) {
      const d = crossTrackKm(v[k], v[i], v[j]);
      if (d > far) { far = d; worst = k; }
    }
    if (worst >= 0 && far > tolKm) {
      keep[worst] = true;
      stack.push([i, worst], [worst, j]);
    }
  }
  return points.filter((_, k) => keep[k]);
}

/**
 * In service by `year`. A cable still "planned" in the data counts only if its planned RFS is
 * ≤ `plannedUntil`: the data is a 2022 snapshot, so cables planned then may be live today.
 */
export function isActive(c: { rfsYear: number | null; planned: boolean }, year: number, plannedUntil = -Infinity): boolean {
  if (c.rfsYear === null) return false;
  return c.planned ? c.rfsYear <= plannedUntil : c.rfsYear <= year;
}

export interface CableGraph {
  verts: LatLon[];
  adj: { to: number; km: number }[][];
}

/** One graph per cable: vertices of all its lines, with touching ends merged so branches connect. */
export function cableGraph(lines: LatLon[][]): CableGraph {
  const verts: LatLon[] = [], adj: CableGraph['adj'] = [];
  const buckets = new Map<string, number[]>();
  // 0.01° buckets (≈ 1.1 km); longitude wraps so ±180° meet
  const lonKey = (lon: number) => Math.round((((lon + 540) % 360) - 180) * 100);
  const wrap = (k: number) => ((((k + 18000) % 36000) + 36000) % 36000) - 18000;

  const vertexOf = (p: LatLon): number => {
    const la = Math.round(p[0] * 100), lo = lonKey(p[1]);
    for (let dl = -1; dl <= 1; dl++)
      for (let dk = -1; dk <= 1; dk++)
        for (const i of buckets.get(`${la + dl}:${wrap(lo + dk)}`) ?? []) if (km(verts[i], p) <= MERGE_KM) return i;
    verts.push(p);
    adj.push([]);
    const key = `${la}:${wrap(lo)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), verts.length - 1]);
    return verts.length - 1;
  };

  for (const line of lines) {
    let prev = -1;
    for (const p of line) {
      const i = vertexOf(p);
      if (prev >= 0 && prev !== i) {
        const d = km(verts[prev], verts[i]);
        adj[prev].push({ to: i, km: d });
        adj[i].push({ to: prev, km: d });
      }
      prev = i;
    }
  }
  return { verts, adj };
}

export function snapLanding(g: CableGraph, at: LatLon): { v: number; km: number } | null {
  let v = -1, best = Infinity;
  g.verts.forEach((p, i) => {
    const d = km(p, at);
    if (d < best) { best = d; v = i; }
  });
  return best <= SNAP_KM ? { v, km: best } : null;
}

export interface Leg { a: string; b: string; points: LatLon[] }

/**
 * Legs between NEIGHBOURING landings: the shortest path along the cable that does not pass
 * through another landing of the same cable. A line A–B–C gives A–B and B–C; a Y gives 3 legs.
 */
export function splitLegs(lines: LatLon[][], landings: { id: string; at: LatLon }[]): { legs: Leg[]; skipped: string[] } {
  const g = cableGraph(lines);
  const owner = new Map<number, string>(), skipped: string[] = [];
  for (const l of landings) {
    const s = snapLanding(g, l.at);
    // two landings on the same vertex would be a zero-length leg: keep the first
    if (!s || owner.has(s.v)) skipped.push(l.id);
    else owner.set(s.v, l.id);
  }

  const legs: Leg[] = [];
  for (const [src, id] of owner) {
    // ponytail: O(V²) Dijkstra per landing; fine because lines are simplified first (tens of vertices).
    const dist = new Map<number, number>([[src, 0]]), prev = new Map<number, number>(), done = new Set<number>();
    for (;;) {
      let u = -1;
      for (const [n, d] of dist) if (!done.has(n) && (u < 0 || d < dist.get(u)!)) u = n;
      if (u < 0) break;
      done.add(u);
      const other = owner.get(u);
      if (u !== src && other !== undefined) {
        if (id < other) {
          const path = [u];
          while (path[0] !== src) path.unshift(prev.get(path[0])!);
          legs.push({ a: id, b: other, points: path.map((v) => g.verts[v]) });
        }
        continue; // a landing is a terminal: never route through it
      }
      for (const e of g.adj[u]) {
        const d = dist.get(u)! + e.km;
        if (d < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, d); prev.set(e.to, u); }
      }
    }
  }
  return { legs, skipped };
}
