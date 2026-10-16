import { cableById, cableName, nodeById, nodeName } from '../data/network';
import { CITIES } from '../data/nodes';
import type { PacketState } from '../sim/engine';
import { angle, toVec } from '../sim/geo';
import { EARTH_KM, FIBRE_MS_PER_KM, routeKm, type Route } from '../sim/route';
import type { LatLon } from '../sim/types';

export const PACKET_STATE_LABEL: Record<PacketState, string> = {
  none: 'Ainda não criado',
  queued: 'Na fila',
  transit: 'Em trânsito',
  lost: 'Perdido',
  resend: 'Retransmitindo',
  delivered: 'Recebido',
  recovered: 'Recuperado',
};

/** Where on the route a fraction falls: the hop pair and the cable carrying it. */
export function whereOnRoute(route: Route, pos: number) {
  const { leg } = route.posAt(pos);
  const l = route.legs[leg];
  return { leg, between: `${nodeName(l.a)} → ${nodeName(l.b)}`, cable: cableName(l.cable) };
}

export const endpointNames = (route: Route) => ({ origin: nodeName(route.hops[0]), destination: nodeName(route.hops.at(-1)!) });

/** "17.340 km · 7 saltos": what the top bar and the HUD say about a route. */
export const routeSummary = (route: Route) =>
  `${Math.round(routeKm(route)).toLocaleString('pt-BR')} km · ${route.legs.length} ${route.legs.length === 1 ? 'salto' : 'saltos'}`;

export interface CableRun { cable: string; name: string; first: number; last: number; at: LatLon }

/** Consecutive legs on the same submarine cable, with the point halfway along them (for its label). */
export function cableRuns(route: Route): CableRun[] {
  const runs: CableRun[] = [];
  route.legs.forEach((leg, i) => {
    if (!cableById.has(leg.cable)) return;
    const prev = runs.at(-1);
    if (prev && prev.cable === leg.cable && prev.last === i - 1) prev.last = i;
    else runs.push({ cable: leg.cable, name: cableName(leg.cable), first: i, last: i, at: [0, 0] });
  });
  for (const run of runs) {
    const a = route.legs[run.first], b = route.legs[run.last];
    run.at = route.posAt((a.from + b.from + b.length) / 2 / route.length).at;
  }
  return runs;
}

export interface GlobeLabel { key: string; kind: 'city' | 'landing' | 'cable'; text: string; id: string; at: LatLon }

/** A landing this close to a city is the city's own station: the city label already covers it. */
const SAME_PLACE_KM = 50;
const nearCity = (at: LatLon) => CITIES.some((c) => angle(toVec(c.at), toVec(at)) * 6371 < SAME_PLACE_KM);

/** Everything the globe overlay names: all cities, the route's own landing stations and cables. */
export function globeLabels(route: Route): GlobeLabel[] {
  const cities = CITIES.map((c): GlobeLabel => ({ key: `city:${c.id}`, kind: 'city', text: c.name, id: c.id, at: c.at }));
  const landings = route.hops
    .map((id) => nodeById.get(id)!)
    .filter((n) => n.kind === 'landing' && !nearCity(n.at))
    .map((n): GlobeLabel => ({ key: `landing:${n.id}`, kind: 'landing', text: nodeName(n.id), id: n.id, at: n.at }));
  const cables = cableRuns(route).map((r): GlobeLabel => ({ key: `cable:${r.cable}:${r.first}`, kind: 'cable', text: r.name, id: r.cable, at: r.at }));
  return [...cities, ...landings, ...cables];
}

export interface LegRow { n: number; between: string; cable: string; cableName: string; sea: boolean; km: number; ms: number }

/** The Rota panel's rows: one per leg, fibre km (land includes the detour) and one-way ms. */
export function legRows(route: Route): LegRow[] {
  return route.legs.map((l, i) => {
    const a = nodeName(l.a), b = nodeName(l.b), km = l.length * EARTH_KM;
    return {
      n: i + 1,
      // a city and its own landing station share a name: say what the hop is instead of "X → X"
      between: a === b ? `${a} · estação de pouso` : `${a} → ${b}`,
      cable: l.cable,
      cableName: cableName(l.cable),
      sea: cableById.has(l.cable),
      km,
      ms: km * FIBRE_MS_PER_KM,
    };
  });
}

/** Share of the route's fibre that lies on the sea floor. */
export const seaShare = (route: Route) =>
  route.legs.reduce((s, l) => s + (cableById.has(l.cable) ? l.length : 0), 0) / (route.length || 1);
