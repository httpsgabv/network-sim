// TCP as a sequence of RTT rounds: each round sends up to cwnd segments, the bottleneck delivers at most one
// bandwidth-delay product of them, and the ACKs grow (or a loss shrinks) the window for the next round.

/** RFC 6928 / Linux default initial window, in segments. */
export const INITCWND = 10;
/** CUBIC multiplicative decrease (RFC 9438 §4.6). */
export const CUBIC_BETA = 0.7;
/** Linux TCP_RTO_MIN. */
export const RTO_MIN_S = 0.2;
const MIN_CWND = 2;
/** Bottleneck buffer = 1 BDP + this many segments; a window beyond 2 × BDP + it overflows the queue. */
const QUEUE_SLACK_SEGMENTS = 4;

export interface TcpState {
  /** Congestion window, in segments. */
  cwnd: number;
  ssthresh: number;
}

export interface RoundIn {
  /** Bottleneck bandwidth, bytes per second. */
  bwBps: number;
  /** Round-trip time, seconds. */
  rtt: number;
  /** Segment payload, bytes (the MTU setting). */
  mss: number;
  /** Bytes the application still has to send. */
  remaining: number;
  /** Per-packet random loss probability. */
  loss: number;
  /** Seeded PRNG; called exactly once per round so the stream stays aligned whatever happens. */
  rand: () => number;
}

export interface RoundOut {
  state: TcpState;
  /** Bytes that reached the receiver this round. */
  delivered: number;
  /** Seconds this round took, recovery included. */
  duration: number;
  lost: false | 'random' | 'queue';
}

export const newConnection = (): TcpState => ({ cwnd: INITCWND, ssthresh: Infinity });

export function round(s: TcpState, i: RoundIn): RoundOut {
  const bdp = i.bwBps * i.rtt;
  const sent = Math.min(s.cwnd * i.mss, i.remaining);
  // At least a quarter segment per round so a near-dead link still progresses (its duration then exceeds the RTT).
  const capacity = Math.max(i.mss / 4, bdp);
  const packets = Math.ceil(sent / i.mss);
  const randomLoss = i.rand() < 1 - Math.pow(1 - i.loss, packets);
  const queueLoss = s.cwnd * i.mss > 2 * bdp + QUEUE_SLACK_SEGMENTS * i.mss;
  const lost = queueLoss ? 'queue' : randomLoss ? 'random' : false;

  // A random loss removes one segment from what arrives; a queue drop doesn't, the link stays busy at capacity.
  const delivered = Math.min(lost === 'random' ? Math.max(0, sent - i.mss) : sent, capacity);
  // ponytail: one segment lost per round and recovered in one extra RTT (SACK + fast retransmit);
  // model burst losses / RTO timeouts if the lesson ever needs them.
  const duration = Math.max(i.rtt, delivered / i.bwBps) + (lost ? i.rtt : 0);

  let state: TcpState;
  if (lost) {
    const cwnd = Math.max(MIN_CWND, Math.floor(s.cwnd * CUBIC_BETA));
    state = { cwnd, ssthresh: cwnd };
  } else if (sent < s.cwnd * i.mss) {
    state = s; // application-limited: Linux doesn't grow a window it isn't using (tcp_is_cwnd_limited)
  } else if (s.cwnd < s.ssthresh) {
    state = { ...s, cwnd: s.cwnd * 2 };
  } else {
    // ponytail: Reno-style +1 per RTT instead of CUBIC's cubic growth; same β, so the cuts match.
    state = { ...s, cwnd: s.cwnd + 1 };
  }
  return { state, delivered, duration, lost };
}

/** Linux RTO with a stable RTT: srtt + max(4 × rttvar, RTO_MIN), and rttvar ≈ 0. */
export const rtoOf = (rtt: number) => rtt + RTO_MIN_S;

/**
 * Slow start after idle (RFC 7661 / Linux `tcp_cwnd_restart`, `net.ipv4.tcp_slow_start_after_idle = 1`):
 * after more than one RTO without sending, the window halves once per RTO elapsed, down to the initial window,
 * and ssthresh keeps ¾ of the old window (`tcp_current_ssthresh`).
 */
export function afterIdle(s: TcpState, idle: number, rtt: number): TcpState {
  const rto = rtoOf(rtt);
  if (idle <= rto) return s;
  const restart = Math.min(INITCWND, s.cwnd);
  const ssthresh = Math.max(s.ssthresh, (s.cwnd >> 1) + (s.cwnd >> 2));
  let cwnd = s.cwnd;
  for (let delta = idle - rto; delta > 0 && cwnd > restart; delta -= rto) cwnd >>= 1;
  return { cwnd: Math.max(cwnd, restart), ssthresh };
}
