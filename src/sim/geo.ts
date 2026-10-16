import type { LatLon } from './types';

export type Vec3 = [number, number, number];

const D = Math.PI / 180;
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));

export function toVec([lat, lon]: LatLon): Vec3 {
  const p = lat * D, l = lon * D;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

export function toLatLon(v: Vec3): LatLon {
  return [Math.asin(clamp1(v[2])) / D, Math.atan2(v[1], v[0]) / D];
}

/** Central angle in radians between two unit vectors. */
export function angle(a: Vec3, b: Vec3): number {
  return Math.acos(clamp1(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
}

/** Great-circle interpolation between two unit vectors. */
export function slerp(a: Vec3, b: Vec3, f: number): Vec3 {
  const w = angle(a, b);
  if (w < 1e-9) return a;
  const s = Math.sin(w), k1 = Math.sin((1 - f) * w) / s, k2 = Math.sin(f * w) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}
