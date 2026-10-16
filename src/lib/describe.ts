import { CABLES } from '../data/cables';
import { nodeById } from '../data/nodes';
import type { PacketState } from '../sim/engine';
import { ROUTE } from '../store';

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
export function whereOnRoute(pos: number) {
  const { leg } = ROUTE.posAt(pos);
  const l = ROUTE.legs[leg];
  return { leg, between: `${nodeName(l.a)} → ${nodeName(l.b)}`, cable: cableNames.get(l.cable) ?? l.cable };
}

export const ORIGIN_NAME = nodeName(ROUTE.hops[0]);
export const DESTINATION_NAME = nodeName(ROUTE.hops.at(-1)!);
export const HOP_COUNT = ROUTE.legs.length;
