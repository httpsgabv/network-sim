import { CABLES } from '../data/cables';
import { nodeById } from '../data/nodes';
import type { PacketState } from '../sim/engine';
import { routeKm, type Route } from '../sim/route';

const cableNames = new Map(CABLES.map((c) => [c.id, c.name]));
const nodeName = (id: string) => nodeById.get(id)?.name ?? id;

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
  return { leg, between: `${nodeName(l.a)} → ${nodeName(l.b)}`, cable: cableNames.get(l.cable) ?? l.cable };
}

export const endpointNames = (route: Route) => ({ origin: nodeName(route.hops[0]), destination: nodeName(route.hops.at(-1)!) });

/** "17.340 km · 7 saltos": what the top bar and the HUD say about a route. */
export const routeSummary = (route: Route) =>
  `${Math.round(routeKm(route)).toLocaleString('pt-BR')} km · ${route.legs.length} ${route.legs.length === 1 ? 'salto' : 'saltos'}`;
