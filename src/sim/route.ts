import type { Cable } from '../data/cables';
import type { NetNode } from '../data/nodes';
import { angle, slerp, toLatLon, toVec, type Vec3 } from './geo';
import type { LatLon } from './types';

export const EARTH_KM = 6371;
/** Light in fibre ≈ 200,000 km/s, i.e. 5 µs per km. */
export const FIBRE_MS_PER_KM = 0.005;
/** The transit stage lasts this many ticks (STAGE_START.transit → sort in the engine). */
const TRANSIT_TICKS = 100;
/** Land fibre follows roads and rail, not great circles: land links cost (and take) this much longer. */
export const TERRESTRIAL_DETOUR = 1.3;

interface Edge { to: string; cable: string; points: Vec3[]; length: number }

export interface Leg {
  a: string;
  b: string;
  cable: string;
  /** Cumulative fibre length (radians) where this leg starts along the route. */
  from: number;
  /** Fibre length: the drawn length, × TERRESTRIAL_DETOUR on land. */
  length: number;
  points: Vec3[];
  cum: number[];
}

export interface RoutePos {
  at: LatLon;
  leg: number;
  /** Fraction travelled within the current leg. */
  f: number;
  /** Altitude above the surface (fraction of radius). Always 0: packets ride on the cable. */
  h: number;
}

export interface Route {
  hops: string[];
  legs: Leg[];
  length: number;
  posAt(s: number): RoutePos;
}

const polyLength = (pts: Vec3[]) => pts.slice(1).reduce((sum, p, i) => sum + angle(pts[i], p), 0);

/** The real network has thousands of edges: build its graph once per (nodes, cables) pair. */
const graphs = new WeakMap<Cable[], { nodes: NetNode[]; graph: Map<string, Edge[]> }>();

function buildGraph(nodes: NetNode[], cables: Cable[]): Map<string, Edge[]> {
  const cached = graphs.get(cables);
  if (cached?.nodes === nodes) return cached.graph;
  const pos = new Map(nodes.map((n) => [n.id, toVec(n.at)]));
  const graph = new Map<string, Edge[]>(nodes.map((n) => [n.id, []]));
  for (const cable of cables) {
    let start = -1;
    cable.path.forEach((p, i) => {
      if (typeof p !== 'string') return;
      if (start >= 0) {
        const span = cable.path.slice(start, i + 1);
        const points = span.map((q) => (typeof q === 'string' ? pos.get(q)! : toVec(q)));
        const a = cable.path[start] as string;
        const length = polyLength(points) * (cable.kind === 'terrestrial' ? TERRESTRIAL_DETOUR : 1);
        graph.get(a)?.push({ to: p, cable: cable.id, points, length });
        graph.get(p)?.push({ to: a, cable: cable.id, points: [...points].reverse(), length });
      }
      start = i;
    });
  }
  graphs.set(cables, { nodes, graph });
  return graph;
}

/** Binary min-heap of [cost, node] for Dijkstra. */
function heap() {
  const a: [number, string][] = [];
  return {
    get size() { return a.length; },
    push(item: [number, string]) {
      a.push(item);
      for (let i = a.length - 1; i > 0; ) {
        const p = (i - 1) >> 1;
        if (a[p][0] <= a[i][0]) break;
        [a[p], a[i]] = [a[i], a[p]];
        i = p;
      }
    },
    pop(): [number, string] {
      const top = a[0], last = a.pop()!;
      if (a.length) {
        a[0] = last;
        for (let i = 0; ; ) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top;
    },
  };
}

export function findRoute(nodes: NetNode[], cables: Cable[], from: string, to: string): Route {
  const graph = buildGraph(nodes, cables);
  if (!graph.has(from) || !graph.has(to)) throw new Error(`unknown node: ${from} or ${to}`);

  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; edge: Edge }>();
  const queue = heap();
  queue.push([0, from]);
  while (queue.size) {
    const [du, u] = queue.pop();
    if (du > dist.get(u)!) continue; // stale entry
    if (u === to) break;
    for (const e of graph.get(u)!) {
      const d = du + e.length;
      if (d < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, d); prev.set(e.to, { node: u, edge: e }); queue.push([d, e.to]); }
    }
  }
  if (!dist.has(to)) throw new Error(`no route from ${from} to ${to}`);

  const hops = [to], edges: Edge[] = [];
  for (let n = to; n !== from; ) {
    const p = prev.get(n)!;
    edges.unshift(p.edge);
    hops.unshift((n = p.node));
  }

  let total = 0;
  const legs: Leg[] = edges.map((e, i) => {
    const cum = [0];
    e.points.slice(1).forEach((p, k) => cum.push(cum[k] + angle(e.points[k], p)));
    const leg = { a: hops[i], b: hops[i + 1], cable: e.cable, from: total, length: e.length, points: e.points, cum };
    total += e.length;
    return leg;
  });

  return {
    hops,
    legs,
    length: total,
    posAt(s) {
      const target = Math.max(0, Math.min(1, s)) * total;
      let li = legs.findIndex((l) => target <= l.from + l.length);
      if (li < 0) li = legs.length - 1;
      const leg = legs[li], local = target - leg.from;
      let k = 0;
      const f = leg.length > 0 ? local / leg.length : 0;
      // fibre length → drawn length (they differ by the detour factor on land)
      const drawn = f * leg.cum[leg.cum.length - 1];
      while (k < leg.cum.length - 2 && drawn > leg.cum[k + 1]) k++;
      const seg = leg.cum[k + 1] - leg.cum[k];
      const v = slerp(leg.points[k], leg.points[k + 1], seg > 0 ? (drawn - leg.cum[k]) / seg : 0);
      return { at: toLatLon(v), leg: li, f, h: 0 };
    },
  };
}

export const routeKm = (route: Route) => route.length * EARTH_KM;

/** Simulated network time per tick, so a longer route reads as a longer one-way trip. */
export const msPerTick = (km: number) => (km * FIBRE_MS_PER_KM) / TRANSIT_TICKS;
