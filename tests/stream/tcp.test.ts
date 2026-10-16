import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/sim/prng';
import { CUBIC_BETA, INITCWND, afterIdle, newConnection, rtoOf, round, type RoundIn } from '../../src/sim/stream/tcp';

const MSS = 1000;
const RTT = 0.04;
const never = () => 1; // rand() ≥ any loss probability: no random loss
const fast: Omit<RoundIn, 'remaining'> = { bwBps: 1e9, rtt: RTT, mss: MSS, loss: 0, rand: never };

describe('tcp round', () => {
  it('starts with the RFC 6928 initial window', () => {
    expect(newConnection()).toEqual({ cwnd: INITCWND, ssthresh: Infinity });
  });

  it('slow start doubles the window every RTT and delivers cwnd × MSS', () => {
    let s = newConnection();
    const sizes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = round(s, { ...fast, remaining: 1e9 });
      sizes.push(r.delivered);
      expect(r.duration).toBe(RTT);
      s = r.state;
    }
    expect(sizes).toEqual([10_000, 20_000, 40_000]);
    expect(s.cwnd).toBe(80);
  });

  it('never delivers more than what is left', () => {
    const r = round(newConnection(), { ...fast, remaining: 2500 });
    expect(r.delivered).toBe(2500);
  });

  it('above ssthresh grows one MSS per RTT (congestion avoidance)', () => {
    const r = round({ cwnd: 20, ssthresh: 16 }, { ...fast, remaining: 1e9 });
    expect(r.state.cwnd).toBe(21);
  });

  it('bandwidth caps a round at one bandwidth-delay product', () => {
    // 1 Mbps × 40 ms = 5 000 B
    const r = round({ cwnd: 8, ssthresh: Infinity }, { ...fast, bwBps: 125_000, remaining: 1e9 });
    expect(r.delivered).toBe(5000);
    expect(r.lost).toBe(false);
  });

  it('a random loss cuts the window by β = 0.7 and costs one more RTT (SACK + resend)', () => {
    const r = round({ cwnd: 40, ssthresh: Infinity }, { ...fast, loss: 0.01, rand: () => 0, remaining: 1e9 });
    expect(r.lost).toBe('random');
    expect(r.state).toEqual({ cwnd: Math.floor(40 * CUBIC_BETA), ssthresh: 28 });
    expect(r.duration).toBe(2 * RTT);
    expect(r.delivered).toBe(39_000);
  });

  it('with 0 % loss the bottleneck queue still overflows when the window outgrows it', () => {
    // BDP = 5 000 B = 5 MSS; queue overflows above 2 × BDP + 4 MSS = 14 MSS
    const ok = round({ cwnd: 14, ssthresh: Infinity }, { ...fast, bwBps: 125_000, remaining: 1e9 });
    const drop = round({ cwnd: 15, ssthresh: Infinity }, { ...fast, bwBps: 125_000, remaining: 1e9 });
    expect(ok.lost).toBe(false);
    expect(drop.lost).toBe('queue');
    expect(drop.state.cwnd).toBe(10);
  });

  it('never goes below 2 segments', () => {
    const r = round({ cwnd: 2, ssthresh: 2 }, { ...fast, loss: 0.5, rand: () => 0, remaining: 1e9 });
    expect(r.state.cwnd).toBe(2);
  });

  it('a tiny link still makes progress: a quarter MSS per round, taking longer than an RTT', () => {
    // 0.05 Mbps × 40 ms = 250 B < MSS / 4
    // cwnd 2 so the queue doesn't overflow; with the initial 10 it would, and that is a separate case
    const r = round({ cwnd: 2, ssthresh: Infinity }, { ...fast, bwBps: 6250, remaining: 1e9 });
    expect(r.lost).toBe(false);
    expect(r.delivered).toBe(MSS / 4);
    expect(r.duration).toBeCloseTo(MSS / 4 / 6250);
  });

  it('same seed → same rounds; a 1 MB transfer at 0.05 Mbps and 5 % loss finishes', () => {
    const run = (seed: number) => {
      const rand = mulberry32(seed);
      let s = newConnection(), left = 1_000_000, t = 0, rounds = 0;
      const trace: string[] = [];
      while (left > 0) {
        const r = round(s, { bwBps: 6250, rtt: RTT, mss: MSS, loss: 0.05, rand, remaining: left });
        left -= r.delivered; t += r.duration; s = r.state; rounds++;
        trace.push(`${r.delivered}:${r.lost}`);
        expect(rounds).toBeLessThan(20_000);
      }
      return { t, trace };
    };
    const a = run(7);
    expect(run(7)).toEqual(a);
    expect(run(8).trace).not.toEqual(a.trace);
    // the link is the limit: ~160 s for 1 MB at 6 250 B/s, plus recovery
    expect(a.t).toBeGreaterThan(150);
  });
});

describe('tcp after idle (Linux tcp_cwnd_restart, RFC 7661)', () => {
  const rto = rtoOf(RTT);

  it('RTO is RTT plus the 200 ms Linux minimum', () => {
    expect(rto).toBeCloseTo(0.24);
  });

  it('an idle shorter than one RTO keeps the window', () => {
    expect(afterIdle({ cwnd: 160, ssthresh: Infinity }, rto * 0.9, RTT).cwnd).toBe(160);
  });

  it('halves the window per RTO idle, never below the initial window', () => {
    expect(afterIdle({ cwnd: 160, ssthresh: Infinity }, rto * 1.5, RTT).cwnd).toBe(80);
    expect(afterIdle({ cwnd: 160, ssthresh: Infinity }, rto * 2.5, RTT).cwnd).toBe(40);
    expect(afterIdle({ cwnd: 160, ssthresh: Infinity }, 10, RTT).cwnd).toBe(INITCWND);
  });

  it('remembers ¾ of the old window as ssthresh, so slow start stops where it was', () => {
    expect(afterIdle({ cwnd: 160, ssthresh: 50 }, 10, RTT).ssthresh).toBe(120);
    expect(afterIdle({ cwnd: 160, ssthresh: 200 }, 10, RTT).ssthresh).toBe(200);
  });

  it('a window already at or below the initial one is left alone', () => {
    expect(afterIdle({ cwnd: 6, ssthresh: 6 }, 10, RTT)).toEqual({ cwnd: 6, ssthresh: 6 });
  });
});
