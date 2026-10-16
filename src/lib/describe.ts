import { cableById, cableName, nodeById, nodeName } from '../data/network';
import { CITIES } from '../data/nodes';
import type { PacketState } from '../sim/engine';
import { angle, toVec } from '../sim/geo';
import { EARTH_KM, FIBRE_MS_PER_KM, routeKm, type Route } from '../sim/route';
import type { LatLon } from '../sim/types';
import { RUNG_LABEL } from '../copy';
import type { Reason } from '../sim/stream/abr';
import { DEFAULT_VIDEO_BITRATE_KBPS } from '../sim/stream/dashjs';
import { STREAM_STAGES, type StreamPlan, type StreamSnapshot } from '../sim/stream/types';

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

const f1 = (n: number) => n.toFixed(1).replace('.', ',');

/** kbit/s for people: "400 kbps", "2,8 Mbps". */
export const mbps = (kbps: number) => (!Number.isFinite(kbps) ? '—' : kbps < 1000 ? `${Math.round(kbps)} kbps` : `${f1(kbps / 1000)} Mbps`);

/** Why the player asked for this rung, in words (the ABR's Reason carries only numbers). */
export function reasonText(r: Reason, rung: number): string {
  const q = RUNG_LABEL[rung];
  switch (r.rule) {
    case 'throughput': return `Throughput: estimativa segura de ${mbps(r.safeKbps ?? NaN)} (× 0,9) → ${q}`;
    case 'bola': return `BOLA: buffer de ${f1(r.bufferS ?? 0)} s${(r.placeholder ?? 0) > 0.05 ? ` + ${f1(r.placeholder!)} s virtuais` : ''} → ${q}`;
    case 'insufficient-buffer':
      return r.capKbps ? `Buffer curto (${f1(r.bufferS ?? 0)} s): teto de ${mbps(r.capKbps)} → ${q}` : `Buffer vazio: desce para ${q}`;
    case 'switch-history': return `Histórico de trocas: a qualidade de cima caiu demais → ${q}`;
    case 'abandon': return `Download lento demais (${mbps(r.safeKbps ?? NaN)}): abandonou e pediu em ${q}`;
    default: return `Sem medição ainda: estimativa inicial de ${DEFAULT_VIDEO_BITRATE_KBPS.toLocaleString('pt-BR')} kbps → ${q}`;
  }
}

/** The stage subtitle in Streaming: what is happening right now, with the places and numbers that explain it. */
export function streamHint(plan: StreamPlan, snap: StreamSnapshot, origin: string, edge: string): string {
  const d = snap.download;
  switch (STREAM_STAGES[snap.stage]) {
    case 'encode': return 'No navegador de Ana: o vídeo é recodificado em 4 qualidades (H.264) e cortado em segmentos de 2 s.';
    case 'connect':
      return `O player de Kenji abre TCP com a CDN em ${nodeName(edge)} e negocia TLS 1.3: 2 idas e voltas (${Math.round(2000 * plan.config.rttEdge)} ms) antes do 1º byte.`;
    case 'manifest': return `Kenji pede o manifesto (qualidades e segmentos). A CDN não tem: busca na origem, em ${nodeName(origin)}.`;
    case 'end': return 'Kenji assistiu até o fim. Veja no gráfico onde a qualidade subiu, caiu ou travou.';
  }
  if (snap.sample.stalled) return 'Buffer vazio: o vídeo congela até o próximo segmento chegar. É o rebuffering.';
  if (!d) return 'Buffer cheio: o player espera para pedir o próximo segmento.';
  const why = `Seg ${String(d.seg + 1).padStart(2, '0')}: ${reasonText(d.reason, d.rung)}.`;
  return d.phase === 'origin' ? `${why} A CDN não tinha: busca na origem.` : why;
}
