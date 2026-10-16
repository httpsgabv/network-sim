import { STAGE_START, STAGES, SEEN, type EventKind, type Stage } from '../sim/engine';

/** A = sender (São Paulo), N = the network, B = receiver (Tóquio). */
export type ActorKey = 'A' | 'N' | 'B';

const STAGE_ACTOR: Record<Stage, { key: ActorKey; label: string }> = {
  send: { key: 'A', label: 'A · Remetente' },
  encrypt: { key: 'A', label: 'A · Remetente' },
  packetize: { key: 'A', label: 'A · Remetente' },
  transit: { key: 'N', label: 'Rede' },
  sort: { key: 'B', label: 'B · Destinatário' },
  sack: { key: 'N', label: 'B → A · Rede' },
  resend: { key: 'N', label: 'A → B · Rede' },
  decrypt: { key: 'B', label: 'B · Destinatário' },
  render: { key: 'B', label: 'B · Destinatário' },
};

export function actorAt(t: number): { key: ActorKey; label: string } {
  if (t >= SEEN) return STAGE_ACTOR.render;
  let stage: Stage = 'send';
  for (const s of STAGES) if (t >= STAGE_START[s]) stage = s;
  return STAGE_ACTOR[stage];
}

/** Stage bar groups, left to right (spans add up to the 9 stages). */
export const ACTOR_GROUPS: { key: ActorKey; label: string; stages: Stage[] }[] = [
  { key: 'A', label: 'A · Remetente', stages: ['send', 'encrypt', 'packetize'] },
  { key: 'N', label: 'Rede', stages: ['transit'] },
  { key: 'B', label: 'B', stages: ['sort'] },
  { key: 'N', label: 'B ⇄ A', stages: ['sack', 'resend'] },
  { key: 'B', label: 'B · Destinatário', stages: ['decrypt', 'render'] },
];

export const ACTOR_OF_EVENT: Record<EventKind, ActorKey> = {
  send: 'A', encrypt: 'A', packetize: 'A', depart: 'N', lost: 'N', 'first-arrival': 'B',
  sorted: 'B', sack: 'N', resend: 'A', complete: 'B', decrypt: 'B', seen: 'B',
};

export const ACTOR_SHORT: Record<ActorKey, string> = { A: 'A', N: '⇄', B: 'B' };
