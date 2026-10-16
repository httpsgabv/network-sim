import { describe, expect, it } from 'vitest';
import { END, SEEN, STAGES, STAGE_START, fromStagePos, plan, snapshot, toStagePos } from '../src/sim/engine';
import { mulberry32 } from '../src/sim/prng';

const photo = plan({ count: 24, loss: 0.12, seed: 7 });
const lostSeqs = photo.packets.filter((p) => p.lost).map((p) => p.seq);

describe('prng', () => {
  it('is deterministic per seed and in [0, 1)', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const xs = Array.from({ length: 100 }, a);
    expect(xs).toEqual(Array.from({ length: 100 }, b));
    expect(xs).not.toEqual(Array.from({ length: 100 }, c));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('plan', () => {
  it('is deterministic: same config, same plan', () => {
    expect(plan({ count: 24, loss: 0.12, seed: 7 })).toEqual(photo);
  });

  it('loses packets at roughly the configured rate', () => {
    const big = plan({ count: 2000, loss: 0.1, seed: 1 });
    const rate = big.packets.filter((p) => p.lost).length / 2000;
    expect(rate).toBeGreaterThan(0.07);
    expect(rate).toBeLessThan(0.13);
  });

  it('loss 0 loses nothing; loss > 0 always loses at least one (so the lesson shows)', () => {
    expect(plan({ count: 24, loss: 0, seed: 7 }).packets.some((p) => p.lost)).toBe(false);
    expect(plan({ count: 3, loss: 0.01, seed: 7 }).packets.some((p) => p.lost)).toBe(true);
  });

  it('every first transmission finishes (or is lost) before sorting starts', () => {
    for (const p of plan({ count: 2000, loss: 0.3, seed: 3 }).packets) {
      expect(p.depart).toBeGreaterThanOrEqual(STAGE_START.transit);
      expect(p.depart + p.travel).toBeLessThan(STAGE_START.sort);
    }
  });

  it('retransmissions all land before decrypt', () => {
    for (const p of plan({ count: 2000, loss: 0.3, seed: 3 }).packets.filter((q) => q.lost)) {
      expect(p.resendDepart!).toBeGreaterThanOrEqual(STAGE_START.resend);
      expect(p.arrive).toBeLessThan(STAGE_START.decrypt);
    }
  });

  it('first-pass arrivals are out of order (jitter)', () => {
    const order = photo.packets.filter((p) => !p.lost).sort((a, b) => a.arrive - b.arrive).map((p) => p.seq);
    expect(order).not.toEqual([...order].sort((a, b) => a - b));
  });

  it('rejects invalid config', () => {
    expect(() => plan({ count: 0, loss: 0, seed: 1 })).toThrow();
    expect(() => plan({ count: 3, loss: 1.2, seed: 1 })).toThrow();
  });
});

describe('snapshot', () => {
  it('maps time to the 9 stages in order, then done', () => {
    STAGES.forEach((stage, i) => expect(snapshot(photo, STAGE_START[stage]).stage).toBe(i));
    expect(snapshot(photo, END).stage).toBe(STAGES.length);
    expect(snapshot(photo, -5).t).toBe(0);
    expect(snapshot(photo, END + 50).t).toBe(END);
  });

  it('packets do not exist before packetizing, then queue', () => {
    expect(snapshot(photo, STAGE_START.encrypt).packets.every((p) => p.state === 'none')).toBe(true);
    expect(snapshot(photo, STAGE_START.packetize).packets.every((p) => p.state === 'queued')).toBe(true);
  });

  it('in transit, packets move forward along the route', () => {
    const p = photo.packets.find((q) => !q.lost)!;
    const a = snapshot(photo, p.depart + p.travel * 0.25).packets[p.seq];
    const b = snapshot(photo, p.depart + p.travel * 0.75).packets[p.seq];
    expect(a.state).toBe('transit');
    expect(b.pos!).toBeGreaterThan(a.pos!);
  });

  it('a lost packet freezes where it was dropped until it is resent', () => {
    const p = photo.packets.find((q) => q.lost)!;
    const dropped = snapshot(photo, p.lostTime! + 1).packets[p.seq];
    expect(dropped.state).toBe('lost');
    expect(dropped.pos).toBeCloseTo(p.lostAt!, 9);
    expect(snapshot(photo, p.resendDepart! + 1).packets[p.seq].state).toBe('resend');
    expect(snapshot(photo, p.arrive + 0.01).packets[p.seq].state).toBe('recovered');
  });

  it('when sorting, the receiver knows exactly which seqs are missing', () => {
    const s = snapshot(photo, STAGE_START.sort);
    expect(s.missing).toEqual(lostSeqs);
    expect(s.received).toEqual(photo.packets.filter((p) => !p.lost).map((p) => p.seq));
  });

  it('the SACK travels back along the route during its stage', () => {
    const span = STAGE_START.resend - STAGE_START.sack;
    expect(snapshot(photo, STAGE_START.sack).sack).toBeCloseTo(1);
    expect(snapshot(photo, STAGE_START.sack + span / 2).sack).toBeCloseTo(0.5);
    expect(snapshot(photo, STAGE_START.sort).sack).toBeNull();
    expect(snapshot(plan({ count: 24, loss: 0, seed: 7 }), STAGE_START.sack + 1).sack).toBeNull();
  });

  it.each([0, 0.05, 0.12, 0.3])('converges: every packet delivered by decrypt (loss %s)', (loss) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = snapshot(plan({ count: 48, loss, seed }), STAGE_START.decrypt);
      expect(s.missing).toEqual([]);
      expect(s.received).toHaveLength(48);
      expect(s.packets.every((p) => p.state === 'delivered' || p.state === 'recovered')).toBe(true);
    }
  });

  it('arrival order lists received seqs by arrival time', () => {
    const s = snapshot(photo, STAGE_START.sort - 1);
    const times = s.arrivalOrder.map((seq) => photo.packets[seq].arrive);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('events are chronological and only include what already happened', () => {
    const mid = snapshot(photo, 100);
    expect(mid.events.every((e) => e.t <= 100)).toBe(true);
    const all = snapshot(photo, END).events;
    expect(all.map((e) => e.t)).toEqual([...all.map((e) => e.t)].sort((a, b) => a - b));
    expect(all.filter((e) => e.kind === 'lost').map((e) => e.seq).sort((a, b) => a! - b!)).toEqual(lostSeqs);
    expect(all.map((e) => e.kind)).toEqual(expect.arrayContaining(['send', 'sack', 'resend', 'seen']));
    expect(snapshot(plan({ count: 24, loss: 0, seed: 7 }), END).events.some((e) => e.kind === 'sack')).toBe(false);
  });
});

describe('stage position (equal-width scrubber)', () => {
  it('each stage start maps to a whole step of 100', () => {
    STAGES.forEach((s, i) => expect(toStagePos(STAGE_START[s])).toBe(i * 100));
    expect(toStagePos(SEEN)).toBe(900);
    expect(toStagePos(END)).toBe(900);
  });

  it('round-trips through fromStagePos', () => {
    for (const t of [0, 5, 31.5, 80, 140, 160, 200, 240, 255, 264]) expect(fromStagePos(toStagePos(t))).toBeCloseTo(t, 9);
    expect(fromStagePos(900)).toBe(END);
    expect(fromStagePos(-10)).toBe(0);
  });
});
