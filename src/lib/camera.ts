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

/** Camera distance from the globe's centre (in radii): close enough to read a coast, far enough to see it whole. */
export const ZOOM_MIN = 1.6;
export const ZOOM_MAX = 6;
/** One +/− press. */
export const ZOOM_STEP = 1.25;

export const zoomed = (distance: number, factor: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, distance * factor));
