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
