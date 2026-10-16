// What the globe shows in Streaming, as pure functions of the plan and its snapshot (the components only draw).
import { edgeOf } from '../data/network';
import { STREAM_STAGES, type StreamPlan, type StreamSnapshot } from '../sim/stream/types';
import type { Route } from '../sim/route';
import { routeFor } from '../store';
import { globeLabels, type GlobeLabel } from './describe';

export type StreamPath = 'toEdge' | 'toViewer';

export interface StreamRoutes {
  edge: string;
  /** Ana's origin → CDN edge: travelled on a cache miss (and by the manifest). */
  toEdge: Route;
  /** CDN edge → Kenji: every segment comes this way. */
  toViewer: Route;
}

const memo = new Map<string, StreamRoutes>();
export function streamRoutes(origin: string, destination: string): StreamRoutes {
  const key = `${origin}>${destination}`;
  let r = memo.get(key);
  if (!r) {
    const edge = edgeOf(origin, destination);
    memo.set(key, (r = { edge, toEdge: routeFor(origin, edge), toViewer: routeFor(edge, destination) }));
  }
  return r;
}

const MANIFEST = STREAM_STAGES.indexOf('manifest');

/** Where the camera looks: the origin while encoding, the origin → edge path on a miss, else the edge → viewer path. */
export function streamFocus(snap: StreamSnapshot): { path: StreamPath; s: number } {
  if (snap.stage === 0) return { path: 'toEdge', s: 0 };
  if (snap.stage === MANIFEST || snap.download?.phase === 'origin') return { path: 'toEdge', s: 0.5 };
  return { path: 'toViewer', s: 0.5 };
}

export interface BurstMark {
  path: StreamPath;
  /** Fraction along the path. */
  s: number;
  kind: 'packet' | 'lost' | 'resend';
  /** 0 → 1 over a loss mark's life (its ring grows and fades). */
  phase: number;
}

/** Visible flow rate along a path, in path lengths per second: a sample, not the real ~5 µs/km. */
const FLOW = 0.9;
const MISS_DOTS = 6;
const LOSS_LIFE_S = 0.6;
const frac = (x: number) => x - Math.floor(x);

/**
 * A segment's packets as a burst of dots (spec: a visual sample, the HUD has the real count): denser when the
 * throughput is higher. Lost packets show as a red mark with an amber resend leaving from it.
 */
export function burstMarks(plan: StreamPlan, snap: StreamSnapshot): BurstMark[] {
  const marks: BurstMark[] = [];
  const t = snap.t, d = snap.download, phase = frac(t * FLOW);
  const flow = (path: StreamPath, n: number) => {
    for (let k = 0; k < n; k++) marks.push({ path, s: frac(phase + k / n), kind: 'packet', phase: 0 });
  };
  if (d?.phase === 'origin') flow('toEdge', MISS_DOTS);
  else if (!d && snap.stage === MANIFEST) flow('toEdge', 1);
  else if (d?.phase === 'transfer') {
    const kbps = Number.isFinite(d.kbps) ? d.kbps : Number.isFinite(snap.sample.estKbps) ? snap.sample.estKbps : 3000;
    flow('toViewer', Math.max(3, Math.min(10, Math.round((kbps / 1000) * 1.2))));
  }
  for (const l of plan.losses) {
    if (t < l.t || t >= l.t + LOSS_LIFE_S) continue;
    const s = 0.2 + 0.6 * frac(l.t * 7.31), age = (t - l.t) / LOSS_LIFE_S;
    marks.push({ path: 'toViewer', s, kind: 'lost', phase: age });
    marks.push({ path: 'toViewer', s: s + age * (1 - s), kind: 'resend', phase: 0 });
  }
  return marks;
}

const PULSE_S = 0.35;

/** White pulse at the origin while it encodes, and at the viewer when a segment lands. */
export function streamPulse(plan: StreamPlan, snap: StreamSnapshot): 'origin' | 'viewer' | null {
  if (snap.stage === 0) return 'origin';
  const last = snap.completed.at(-1);
  return last && snap.t - last.done < PULSE_S && snap.t < plan.end ? 'viewer' : null;
}

/** Both paths' landings and cables, once each; the edge city is named as the CDN. */
export function streamGlobeLabels(r: StreamRoutes): GlobeLabel[] {
  const byKey = new Map<string, GlobeLabel>();
  for (const l of [...globeLabels(r.toEdge), ...globeLabels(r.toViewer)]) if (!byKey.has(l.key)) byKey.set(l.key, l);
  const edge = byKey.get(`city:${r.edge}`);
  if (edge) byKey.set(edge.key, { ...edge, text: `${edge.text} · CDN` });
  return [...byKey.values()];
}
