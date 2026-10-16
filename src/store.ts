import { create } from 'zustand';
import { NETWORK_CABLES, NETWORK_NODES, edgeOf } from './data/network';
import { END, STAGE_START, STAGES, plan, type Plan } from './sim/engine';
import { MTU, type Transmission } from './sim/pipeline';
import { FIBRE_MS_PER_KM, findRoute, msPerTick, routeKm, type Route } from './sim/route';
import { LAST_MILE_RTT_S, nominalSizes, planStream } from './sim/stream/engine';
import type { ProfileId } from './sim/stream/profiles';
import type { StreamPlan } from './sim/stream/types';
import { prefersReducedMotion } from './lib/useReducedMotion';

const routes = new Map<string, Route>();
/** Memoized per pair: at most 15 × 14 routes, so switching never re-runs Dijkstra on a seen pair. */
export function routeFor(origin: string, destination: string): Route {
  const key = `${origin}>${destination}`;
  let r = routes.get(key);
  if (!r) routes.set(key, (r = findRoute(NETWORK_NODES, NETWORK_CABLES, origin, destination)));
  return r;
}

/** `count` is only a placeholder until a real payload has been encrypted and packetized. */
export const KINDS = {
  text: { count: 3, label: 'Texto' },
  photo: { count: 24, label: 'Foto' },
  video: { count: 48, label: 'Vídeo' },
} as const;
export type Kind = keyof typeof KINDS;
/** Transferência uses events | packet | route; Streaming uses chart | events | segment. */
export type Panel = 'events' | 'packet' | 'route' | 'chart' | 'segment';
export type Mode = 'transfer' | 'stream';

/** Spec streaming.md: 4 rungs (Apple HLS-like ladder), 15 segments of 2 s. */
export const STREAM_LADDER_KBPS = [400, 1200, 2800, 5000] as const;
export const STREAM_SEGMENTS = 15;
export const STREAM_SEG_DUR = 2;
/** At 5 % loss TCP already collapses to 240p, so Streaming steps lower than Transferência (approved after mockup v9). */
export const STREAM_LOSSES = [0, 0.005, 0.01, 0.05] as const;

export interface Payload {
  kind: Kind;
  name: string;
  mime: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** A real send: the payload, its ciphertext packets and what the receiver decrypted. */
export interface Transfer extends Omit<Transmission, 'delivered'> {
  payload: Payload;
  delivered: Uint8Array;
  /** Object URLs for media (sender preview / receiver result); absent for text. */
  previewUrl?: string;
  deliveredUrl?: string;
  /** A still image of the content (the photo itself, or a video's first frame) for the packet buffer. */
  posterUrl?: string;
}

/** At 1× the whole send (END ticks) takes END / TICKS_PER_SECOND ≈ 13.5 s. */
export const TICKS_PER_SECOND = 20;
const MAX_FRAME_MS = 100;
const SEED = 7;
// ponytail: nominal sizes until the encoder (T10.11) reports the real ones.
const NOMINAL_SIZES = nominalSizes(STREAM_LADDER_KBPS, STREAM_SEGMENTS, STREAM_SEG_DUR, SEED);

interface SimState {
  mode: Mode;
  setMode(mode: Mode): void;
  /** Transferência: ticks; Streaming: simulated seconds (1× = real time). */
  t: number;
  playing: boolean;
  speed: number;
  kind: Kind;
  loss: number;
  /** Node ids, always different; the route and its latency derive from the pair. */
  origin: string;
  destination: string;
  route: Route;
  msPerTick: number;
  setRoute(origin: string, destination: string): void;
  swapRoute(): void;
  /** Middle detail card: the event log, or the packet picked in a queue. */
  panel: Panel;
  setPanel(panel: Panel): void;
  /** Submarine cable whose card is open in the Rota panel (a cables.json id), or none. */
  selectedCable: string | null;
  selectCable(id: string | null): void;
  /** Packet size used for the next send (SPEC criterion 4: 256 B – 8 KB). */
  mtu: number;
  selected: number;
  plan: Plan;
  transfer: Transfer | null;
  setMtu(mtu: number): void;
  tick(dtMs: number): void;
  toggle(): void;
  restart(): void;
  stepNext(): void;
  scrub(t: number): void;
  setSpeed(speed: number): void;
  setKind(kind: Kind): void;
  setLoss(loss: number): void;
  load(transfer: Transfer): void;
  select(seq: number): void;
  /** Streaming: Kenji's last-mile profile, packet loss, the planned session and the segment open in Segmento. */
  profile: ProfileId;
  streamLoss: number;
  streamPlan: StreamPlan;
  streamSeg: number | null;
  setProfile(profile: ProfileId): void;
  setStreamLoss(loss: number): void;
  selectSeg(seg: number): void;
  reset(): void;
}

const oneWayS = (o: string, d: string) => (routeKm(routeFor(o, d)) * FIBRE_MS_PER_KM) / 1000;
/** The session Kenji watches: Ana's origin → CDN edge (closest city to Kenji) → Kenji. */
export function streamPlanFor(origin: string, destination: string, profile: ProfileId, loss: number, mss: number): StreamPlan {
  const edge = edgeOf(origin, destination);
  return planStream({
    ladderKbps: STREAM_LADDER_KBPS, segBytes: NOMINAL_SIZES, segDur: STREAM_SEG_DUR, profile, seed: SEED, loss, mss,
    rttEdge: 2 * oneWayS(edge, destination) + LAST_MILE_RTT_S, rttOrigin: 2 * oneWayS(origin, edge),
  });
}

const build = (count: number, loss: number) => plan({ count, loss, seed: SEED });
const countOf = (s: { transfer: Transfer | null; kind: Kind }) => s.transfer?.packets.length ?? KINDS[s.kind].count;
type Clock = Pick<SimState, 'mode' | 'streamPlan'>;
const endOf = (s: Clock) => (s.mode === 'stream' ? s.streamPlan.end : END);
const stageStarts = (s: Clock) => (s.mode === 'stream' ? s.streamPlan.stageStart : STAGES.map((st) => STAGE_START[st]));
const ticksPerSecond = (s: Clock) => (s.mode === 'stream' ? 1 : TICKS_PER_SECOND);

// With reduced motion the user starts playback themselves instead of it autoplaying.
const route0 = routeFor('sao', 'tyo');
const initial = { mode: 'transfer' as Mode, profile: 'drop' as ProfileId, streamLoss: 0, streamSeg: null as number | null, origin: 'sao', destination: 'tyo', route: route0, msPerTick: msPerTick(routeKm(route0)), t: 0, playing: !prefersReducedMotion(), speed: 1, kind: 'photo' as Kind, loss: 0.12, mtu: MTU, selected: 5, transfer: null, panel: 'events' as Panel, selectedCable: null as string | null };

export const useSim = create<SimState>()((set, get) => ({
  ...initial,
  plan: build(KINDS[initial.kind].count, initial.loss),
  streamPlan: streamPlanFor(initial.origin, initial.destination, initial.profile, initial.streamLoss, initial.mtu),

  tick(dtMs) {
    const { playing, t, speed } = get();
    if (!playing) return;
    const end = endOf(get());
    const next = t + (Math.min(dtMs, MAX_FRAME_MS) / 1000) * ticksPerSecond(get()) * speed;
    set(next >= end ? { t: end, playing: false } : { t: next });
  },
  toggle() {
    const { t, playing } = get();
    set(t >= endOf(get()) ? { t: 0, playing: true } : { playing: !playing });
  },
  restart: () => set({ t: 0, playing: true }),
  stepNext() {
    const t = get().t;
    const next = stageStarts(get()).find((start) => start > t);
    set({ t: next ?? endOf(get()), playing: false });
  },
  scrub: (t) => set({ t: Math.max(0, Math.min(endOf(get()), t)), playing: false }),
  setMode: (mode) => set({ mode, t: 0, playing: !prefersReducedMotion(), panel: mode === 'stream' ? 'chart' : 'events' }),
  // every scenario control restarts the session, like the transfer controls do
  setProfile(profile) {
    const { origin, destination, streamLoss, mtu } = get();
    set({ profile, streamPlan: streamPlanFor(origin, destination, profile, streamLoss, mtu), streamSeg: null, t: 0, playing: !prefersReducedMotion() });
  },
  setStreamLoss(streamLoss) {
    const { origin, destination, profile, mtu } = get();
    set({ streamLoss, streamPlan: streamPlanFor(origin, destination, profile, streamLoss, mtu), streamSeg: null, t: 0, playing: !prefersReducedMotion() });
  },
  selectSeg: (seg) => set({ streamSeg: Math.max(0, Math.min(seg, STREAM_SEGMENTS - 1)), panel: 'segment' }),
  setSpeed: (speed) => set({ speed }),
  setKind(kind) {
    const p = build(KINDS[kind].count, get().loss);
    set({ kind, transfer: null, plan: p, t: 0, playing: true, selected: Math.min(get().selected, p.packets.length - 1) });
  },
  setMtu(mtu) {
    // Transferência: the MTU applies to the next send. Streaming: it is the TCP MSS, so the session restarts.
    const { mode, origin, destination, profile, streamLoss } = get();
    const streamPlan = streamPlanFor(origin, destination, profile, streamLoss, mtu);
    set(mode === 'stream' ? { mtu, streamPlan, streamSeg: null, t: 0, playing: !prefersReducedMotion() } : { mtu, streamPlan });
  },
  setRoute(origin, destination) {
    const { origin: o, destination: d } = get();
    // picking the city that is at the other end swaps the pair instead of being refused
    if (origin === destination) [origin, destination] = [d, o];
    const route = routeFor(origin, destination);
    // the plan stays: its seed doesn't depend on the route, so the same seqs are lost anywhere
    const { profile, streamLoss, mtu } = get();
    set({ origin, destination, route, msPerTick: msPerTick(routeKm(route)), streamPlan: streamPlanFor(origin, destination, profile, streamLoss, mtu), streamSeg: null, t: 0, playing: !prefersReducedMotion() });
  },
  swapRoute: () => get().setRoute(get().destination, get().origin),
  setLoss: (loss) => set({ loss, plan: build(countOf(get()), loss), t: 0, playing: true }),
  load(transfer) {
    const p = build(transfer.packets.length, get().loss);
    set({ transfer, kind: transfer.payload.kind, plan: p, t: 0, playing: true, selected: Math.min(get().selected, p.packets.length - 1) });
  },
  // picking a packet anywhere opens its details in the middle card
  select: (seq) => set({ selected: Math.max(0, Math.min(seq, get().plan.packets.length - 1)), panel: 'packet' }),
  setPanel: (panel) => set({ panel }),
  // picking a cable anywhere (list or globe) opens its card in the Rota panel
  selectCable: (id) => set(id ? { selectedCable: id, panel: 'route' } : { selectedCable: null }),
  reset: () => set({ ...initial, plan: build(KINDS[initial.kind].count, initial.loss), streamPlan: streamPlanFor(initial.origin, initial.destination, initial.profile, initial.streamLoss, initial.mtu) }),
}));
