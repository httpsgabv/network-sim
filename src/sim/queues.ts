import { STAGE_START, type PacketState, type Plan, type Snapshot } from './engine';

/** Why a packet is sitting in A's outgoing queue, or null when it is not at A. */
export type SenderSlot = 'queued' | 'awaiting-resend' | null;
export interface SenderItem { seq: number; slot: SenderSlot }

/**
 * A · outgoing queue. Places are stable (one per seq): a departing packet leaves an empty place
 * behind instead of shifting the others; lost packets reappear once B's SACK has reached A.
 */
export function senderLayout(sim: Plan, t: number): SenderItem[] {
  return sim.packets.map((p) => {
    let slot: SenderSlot = null;
    if (t >= STAGE_START.packetize) {
      if (p.lost && t >= STAGE_START.resend && t < p.resendDepart!) slot = 'awaiting-resend';
      else if (t < p.depart) slot = 'queued';
    }
    return { seq: p.seq, slot };
  });
}

export interface BufferItem { seq: number; state: PacketState; flipId: string }

/**
 * B · incoming buffer. Before sorting: only what arrived, append-only in arrival order (one move
 * per arrival, no reshuffle), plus empty slots. After sorting: every seq in order; a packet B is
 * still missing is a "hole" with its own flip id, so the real packet can later fly in from A.
 */
export function receiverLayout(snap: Snapshot): { items: BufferItem[]; slots: number } {
  const n = snap.packets.length;
  if (snap.t < STAGE_START.sort) {
    const items = snap.arrivalOrder.map((seq) => ({ seq, state: snap.packets[seq].state, flipId: String(seq) }));
    return { items, slots: n - items.length };
  }
  const items = snap.packets.map((p) => {
    const here = p.state === 'delivered' || p.state === 'recovered';
    return { seq: p.seq, state: p.state === 'transit' ? 'lost' as const : p.state, flipId: here ? String(p.seq) : `hole:${p.seq}` };
  });
  return { items, slots: 0 };
}
