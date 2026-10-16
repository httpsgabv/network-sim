import { STAGE_START, type Snapshot } from '../sim/engine';

/**
 * Route fraction the camera should look at: the SACK while it flies back, otherwise the
 * median of the packets in flight (robust to stragglers), else sender before transit / receiver after.
 */
export function focusAt(snap: Snapshot): number {
  if (snap.sack !== null) return snap.sack;
  const moving = snap.packets
    .filter((p) => (p.state === 'transit' || p.state === 'resend') && p.pos !== null)
    .map((p) => p.pos!)
    .sort((a, b) => a - b);
  if (moving.length) return moving[Math.floor(moving.length / 2)];
  return snap.t < STAGE_START.transit ? 0 : 1;
}
