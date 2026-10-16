import { mulberry32 } from './prng';

// Time is in abstract ticks; the store maps ticks to wall-clock and to simulated ms.
export const STAGES = ['send', 'encrypt', 'packetize', 'transit', 'sort', 'sack', 'resend', 'decrypt', 'render'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_START: Record<Stage, number> = {
  send: 0, encrypt: 10, packetize: 20, transit: 30, sort: 130, sack: 145, resend: 175, decrypt: 235, render: 250,
};
/** "Seen" receipt time; the timeline runs a little past it so the final state is visible. */
export const SEEN = 265;
export const END = 270;

const TRAVEL = 50;
const JITTER = 14;
const DEPART_WINDOW = 40;
const RESEND_WINDOW = 9;
/** Ticks between the SACK reaching A and the first resend, so lost packets visibly wait in A's queue. */
const RESEND_LEAD = 2;

export interface SimConfig { count: number; loss: number; seed: number }

export interface PlannedPacket {
  seq: number;
  depart: number;
  travel: number;
  lost: boolean;
  /** Route fraction where the packet was dropped. */
  lostAt?: number;
  lostTime?: number;
  resendDepart?: number;
  /** When it finally reaches the receiver (after retransmission if lost). */
  arrive: number;
}

export type EventKind = 'send' | 'encrypt' | 'packetize' | 'depart' | 'lost' | 'first-arrival' | 'sorted' | 'sack' | 'resend' | 'complete' | 'decrypt' | 'seen';
export interface SimEvent { t: number; kind: EventKind; seq?: number; pos?: number }

export interface Plan { config: SimConfig; packets: PlannedPacket[]; events: SimEvent[] }

export function plan(config: SimConfig): Plan {
  const { count, loss, seed } = config;
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`count must be a positive integer, got ${count}`);
  if (!(loss >= 0 && loss <= 1)) throw new RangeError(`loss must be in [0, 1], got ${loss}`);

  const rand = mulberry32(seed);
  const spacing = Math.min(2, DEPART_WINDOW / count);
  const packets: PlannedPacket[] = Array.from({ length: count }, (_, seq) => {
    const lost = rand() < loss;
    const lostAt = 0.18 + rand() * 0.6;
    const travel = TRAVEL + (rand() - 0.5) * JITTER;
    return { seq, depart: STAGE_START.transit + seq * spacing, travel, lost, lostAt, arrive: 0 };
  });
  // Didactic: any non-zero loss shows at least one recovery, even for a 3-packet message.
  if (loss > 0 && !packets.some((p) => p.lost)) packets[Math.floor(count * 0.4)].lost = true;

  const lostOnes = packets.filter((p) => p.lost);
  const resendGap = Math.min(3, (RESEND_WINDOW - RESEND_LEAD) / Math.max(1, lostOnes.length));
  // ponytail: retransmissions are never lost again; add a second SACK round if that lesson matters.
  lostOnes.forEach((p, i) => { p.resendDepart = STAGE_START.resend + RESEND_LEAD + i * resendGap; });
  for (const p of packets) {
    if (p.lost) {
      p.lostTime = p.depart + p.travel * p.lostAt!;
      p.arrive = p.resendDepart! + TRAVEL;
    } else {
      delete p.lostAt;
      p.arrive = p.depart + p.travel;
    }
  }

  const events: SimEvent[] = ([
    { t: STAGE_START.send, kind: 'send' },
    { t: STAGE_START.encrypt, kind: 'encrypt' },
    { t: STAGE_START.packetize, kind: 'packetize' },
    { t: STAGE_START.transit, kind: 'depart', seq: 0 },
    ...lostOnes.map((p): SimEvent => ({ t: p.lostTime!, kind: 'lost', seq: p.seq, pos: p.lostAt })),
    { t: Math.min(...packets.filter((p) => !p.lost).map((p) => p.arrive), Infinity), kind: 'first-arrival' },
    { t: STAGE_START.sort, kind: 'sorted' },
    ...(lostOnes.length ? [{ t: STAGE_START.sack, kind: 'sack' }, { t: STAGE_START.resend, kind: 'resend' }] satisfies SimEvent[] : []),
    { t: STAGE_START.decrypt, kind: 'complete' },
    { t: STAGE_START.render, kind: 'decrypt' },
    { t: SEEN, kind: 'seen' },
  ] satisfies SimEvent[]).filter((e) => Number.isFinite(e.t));
  events.sort((a, b) => a.t - b.t);

  return { config, packets, events };
}

export type PacketState = 'none' | 'queued' | 'transit' | 'lost' | 'resend' | 'delivered' | 'recovered';
export interface PacketView { seq: number; state: PacketState; /** Route fraction, when on the globe. */ pos: number | null }

export interface Snapshot {
  t: number;
  /** Index into STAGES; STAGES.length once the message has been seen. */
  stage: number;
  stageProgress: number;
  packets: PacketView[];
  /** Received seqs, ascending. */
  received: number[];
  /** Seqs not yet received (after packetizing), ascending. */
  missing: number[];
  /** Received seqs in the order they arrived. */
  arrivalOrder: number[];
  /** Route fraction of the SACK flying back to the sender, or null. */
  sack: number | null;
  events: SimEvent[];
}

const STARTS = STAGES.map((s) => STAGE_START[s]);

function packetAt(p: PlannedPacket, t: number): PacketView {
  const view = (state: PacketState, pos: number | null = null) => ({ seq: p.seq, state, pos });
  if (t < STAGE_START.packetize) return view('none');
  if (t < p.depart) return view('queued');
  const progress = (t - p.depart) / p.travel;
  if (!p.lost) return progress < 1 ? view('transit', progress) : view('delivered');
  if (progress < p.lostAt!) return view('transit', progress);
  if (t < p.resendDepart!) return view('lost', p.lostAt!);
  if (t < p.arrive) return view('resend', (t - p.resendDepart!) / TRAVEL);
  return view('recovered');
}

export function snapshot(sim: Plan, time: number): Snapshot {
  const t = Math.max(0, Math.min(END, time));
  let stage = t >= SEEN ? STAGES.length : 0;
  if (stage === 0) STARTS.forEach((start, i) => { if (t >= start) stage = i; });
  const next = stage < STAGES.length - 1 ? STARTS[stage + 1] : SEEN;
  const stageProgress = stage === STAGES.length ? 1 : (t - STARTS[stage]) / (next - STARTS[stage]);

  const packets = sim.packets.map((p) => packetAt(p, t));
  const arrived = sim.packets.filter((p) => t >= p.arrive);
  const receivedSet = new Set(arrived.map((p) => p.seq));
  const anyLost = sim.packets.some((p) => p.lost);
  const inSack = anyLost && t >= STAGE_START.sack && t < STAGE_START.resend;

  return {
    t,
    stage,
    stageProgress,
    packets,
    received: [...receivedSet].sort((a, b) => a - b),
    missing: t < STAGE_START.packetize ? [] : sim.packets.map((p) => p.seq).filter((s) => !receivedSet.has(s)),
    arrivalOrder: [...arrived].sort((a, b) => a.arrive - b.arrive || a.seq - b.seq).map((p) => p.seq),
    sack: inSack ? 1 - (t - STAGE_START.sack) / (STAGE_START.resend - STAGE_START.sack) : null,
    events: sim.events.filter((e) => e.t <= t),
  };
}

/** Maps time to 0..900 where every stage is 100 wide, so the scrubber matches the 9-segment bar. */
export function toStagePos(time: number): number {
  const t = Math.max(0, time);
  if (t >= SEEN) return STAGES.length * 100;
  let i = 0;
  STARTS.forEach((start, k) => { if (t >= start) i = k; });
  const next = i < STAGES.length - 1 ? STARTS[i + 1] : SEEN;
  return i * 100 + ((t - STARTS[i]) / (next - STARTS[i])) * 100;
}

export function fromStagePos(pos: number): number {
  const v = Math.max(0, pos);
  if (v >= STAGES.length * 100) return END;
  const i = Math.floor(v / 100);
  const next = i < STAGES.length - 1 ? STARTS[i + 1] : SEEN;
  return STARTS[i] + ((v - i * 100) / 100) * (next - STARTS[i]);
}
