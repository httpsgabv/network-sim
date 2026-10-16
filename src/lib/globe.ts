import { Vector3 } from 'three';
import { angle, slerp, type Vec3 } from '../sim/geo';
import type { LatLon } from '../sim/types';

const D = Math.PI / 180;

/** three.js convention: y up, lon 0 / lat 0 faces +z (towards the default camera). */
export function toXYZ([lat, lon]: LatLon): Vec3 {
  const p = lat * D, l = lon * D;
  return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
}

export const toVector = (ll: LatLon, r = 1) => new Vector3(...toXYZ(ll)).multiplyScalar(r);

/** Great-circle polyline through the given points, sampled every `stepDeg`, lifted to radius `r`. */
export function arc(points: LatLon[], r = 1, stepDeg = 1.5): Vector3[] {
  const vs = points.map(toXYZ), out: Vector3[] = [];
  vs.forEach((v, i) => {
    if (i === 0) return out.push(new Vector3(...v).multiplyScalar(r));
    const a = vs[i - 1], n = Math.max(1, Math.ceil(angle(a, v) / D / stepDeg));
    for (let k = 1; k <= n; k++) out.push(new Vector3(...slerp(a, v, k / n)).multiplyScalar(r));
  });
  return out;
}

export const latLonLines = (stepDeg: number) => {
  const lines: LatLon[][] = [];
  for (let lon = -180; lon < 180; lon += stepDeg) lines.push(Array.from({ length: 33 }, (_, i) => [-80 + i * 5, lon] as const));
  for (let lat = -60; lat <= 60; lat += stepDeg) lines.push(Array.from({ length: 73 }, (_, i) => [lat, -180 + i * 5] as const));
  return lines;
};

/**
 * Many polylines as one flat LineSegments buffer ([a, b, b, c, …] per line), lifted to radius `r`:
 * the whole cable mesh becomes a single draw call.
 */
export function segmentBuffer(lines: LatLon[][], r = 1, stepDeg = 1.5): Float32Array {
  const out: number[] = [];
  for (const line of lines) {
    if (line.length < 2) continue;
    const pts = arc(line, r, stepDeg);
    for (let i = 1; i < pts.length; i++) out.push(pts[i - 1].x, pts[i - 1].y, pts[i - 1].z, pts[i].x, pts[i].y, pts[i].z);
  }
  return new Float32Array(out);
}

export interface CableMesh { positions: Float32Array; owners: string[]; r: number }

/** segmentBuffer for many cables, remembering which cable owns each segment (for picking). */
export function cableMesh(groups: { id: string; lines: LatLon[][] }[], r = 1): CableMesh {
  const parts: Float32Array[] = [], owners: string[] = [];
  for (const g of groups) {
    const buf = segmentBuffer(g.lines, r);
    parts.push(buf);
    for (let i = 0; i < buf.length / 6; i++) owners.push(g.id);
  }
  const positions = new Float32Array(owners.length * 6);
  let o = 0;
  for (const p of parts) { positions.set(p, o); o += p.length; }
  return { positions, owners, r };
}

/**
 * The cable whose drawing passes closest to `p` (a point on the globe, any radius), within `maxDist`
 * (world units, ≈ 6 371 km per unit). A linear scan: it runs once per click, not per frame.
 */
export function nearestCable(mesh: CableMesh, p: Vec3, maxDist: number): string | null {
  const len = Math.hypot(...p) || 1, k = mesh.r / len;
  const px = p[0] * k, py = p[1] * k, pz = p[2] * k, a = mesh.positions;
  let best = maxDist * maxDist, hit: string | null = null;
  for (let s = 0; s < mesh.owners.length; s++) {
    const i = s * 6;
    const ax = a[i], ay = a[i + 1], az = a[i + 2], dx = a[i + 3] - ax, dy = a[i + 4] - ay, dz = a[i + 5] - az;
    const dd = dx * dx + dy * dy + dz * dz;
    const f = dd > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / dd)) : 0;
    const ex = ax + f * dx - px, ey = ay + f * dy - py, ez = az + f * dz - pz;
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 < best) { best = d2; hit = mesh.owners[s]; }
  }
  return hit;
}

/** `--transit` from tokens.css (three.js can't read CSS variables): packets in flight and the route they follow. */
export const TRANSIT = '#ff4fa3';
