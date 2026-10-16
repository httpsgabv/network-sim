import { describe, expect, it } from 'vitest';
import { focusAt } from '../src/lib/camera';
import { STAGE_START, plan, snapshot } from '../src/sim/engine';

const lossy = plan({ count: 24, loss: 0.12, seed: 7 });
const clean = plan({ count: 24, loss: 0, seed: 7 });
const at = (p: typeof lossy, t: number) => focusAt(snapshot(p, t));

describe('focusAt (what the camera follows)', () => {
  it('looks at the sender before packets leave and at the receiver once they land', () => {
    expect(at(lossy, 0)).toBe(0);
    expect(at(lossy, STAGE_START.sort)).toBe(1);
    expect(at(lossy, STAGE_START.render)).toBe(1);
  });

  it('follows the swarm forward during transit', () => {
    const a = at(clean, 60), b = at(clean, 90), c = at(clean, 115);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThanOrEqual(1);
  });

  it('flies back with the SACK, then forward with the retransmission', () => {
    const early = at(lossy, STAGE_START.sack + 5), late = at(lossy, STAGE_START.sack + 25);
    expect(late).toBeLessThan(early);
    expect(at(lossy, STAGE_START.resend + 30)).toBeGreaterThan(at(lossy, STAGE_START.resend + 5));
  });

  it('ignores packets frozen where they were lost', () => {
    // after first-pass arrivals and before resend, only lost packets have a position
    expect(at(lossy, STAGE_START.sort + 5)).toBe(1);
  });
});
