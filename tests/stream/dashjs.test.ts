import { describe, expect, it } from 'vitest';
import { BOLA_MINIMUM_BUFFER_S, bolaParams, HYBRID_SWITCH_BUFFER_S, HYBRID_SWITCH_OFF_S } from '../../src/sim/stream/dashjs';

const LADDER = [400, 1200, 2800, 5000];

describe('dash.js constants', () => {
  it('BOLA prefers the lowest rung at the minimum buffer and the top one at bufferTime (BolaRule.js comment)', () => {
    const { utilities, gp, Vp } = bolaParams(LADDER);
    expect(utilities[0]).toBe(1);
    expect(Vp * (utilities[0] + gp - 1)).toBeCloseTo(BOLA_MINIMUM_BUFFER_S);
    // 4 levels: max(18, 10 + 2 × 4) = 18 s
    expect(Vp * (utilities[3] + gp - 1)).toBeCloseTo(18);
  });

  it('switches back from BOLA at half the switch-on buffer', () => {
    expect(HYBRID_SWITCH_OFF_S).toBe(HYBRID_SWITCH_BUFFER_S / 2);
  });
});
