import { create } from 'zustand';
import { CABLES } from './data/cables';
import { NODES } from './data/nodes';
import { END, STAGE_START, STAGES, plan, type Plan } from './sim/engine';
import { MTU, type Transmission } from './sim/pipeline';
import { findRoute } from './sim/route';
import { prefersReducedMotion } from './lib/useReducedMotion';

/** v1 scenario is fixed (see SPEC "Decisões"); the graph already supports other city pairs. */
export const ROUTE = findRoute(NODES, CABLES, 'sao', 'tyo');

/** `count` is only a placeholder until a real payload has been encrypted and packetized. */
export const KINDS = {
  text: { count: 3, label: 'Texto' },
  photo: { count: 24, label: 'Foto' },
  video: { count: 48, label: 'Vídeo' },
} as const;
export type Kind = keyof typeof KINDS;
export type Panel = 'events' | 'packet';

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
/** Simulated network time per tick: transit (100 ticks) ≈ 135 ms one-way SP → Tóquio. */
export const MS_PER_TICK = 1.35;
const MAX_FRAME_MS = 100;
const SEED = 7;

interface SimState {
  t: number;
  playing: boolean;
  speed: number;
  kind: Kind;
  loss: number;
  /** Middle detail card: the event log, or the packet picked in a queue. */
  panel: Panel;
  setPanel(panel: Panel): void;
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
  reset(): void;
}

const build = (count: number, loss: number) => plan({ count, loss, seed: SEED });
const countOf = (s: { transfer: Transfer | null; kind: Kind }) => s.transfer?.packets.length ?? KINDS[s.kind].count;
const clampT = (t: number) => Math.max(0, Math.min(END, t));

// With reduced motion the user starts playback themselves instead of it autoplaying.
const initial = { t: 0, playing: !prefersReducedMotion(), speed: 1, kind: 'photo' as Kind, loss: 0.12, mtu: MTU, selected: 5, transfer: null, panel: 'events' as Panel };

export const useSim = create<SimState>()((set, get) => ({
  ...initial,
  plan: build(KINDS[initial.kind].count, initial.loss),

  tick(dtMs) {
    const { playing, t, speed } = get();
    if (!playing) return;
    const next = t + (Math.min(dtMs, MAX_FRAME_MS) / 1000) * TICKS_PER_SECOND * speed;
    set(next >= END ? { t: END, playing: false } : { t: next });
  },
  toggle() {
    const { t, playing } = get();
    set(t >= END ? { t: 0, playing: true } : { playing: !playing });
  },
  restart: () => set({ t: 0, playing: true }),
  stepNext() {
    const t = get().t;
    const next = STAGES.map((s) => STAGE_START[s]).find((start) => start > t);
    set({ t: next ?? END, playing: false });
  },
  scrub: (t) => set({ t: clampT(t), playing: false }),
  setSpeed: (speed) => set({ speed }),
  setKind(kind) {
    const p = build(KINDS[kind].count, get().loss);
    set({ kind, transfer: null, plan: p, t: 0, playing: true, selected: Math.min(get().selected, p.packets.length - 1) });
  },
  setMtu: (mtu) => set({ mtu }),
  setLoss: (loss) => set({ loss, plan: build(countOf(get()), loss), t: 0, playing: true }),
  load(transfer) {
    const p = build(transfer.packets.length, get().loss);
    set({ transfer, kind: transfer.payload.kind, plan: p, t: 0, playing: true, selected: Math.min(get().selected, p.packets.length - 1) });
  },
  // picking a packet anywhere opens its details in the middle card
  select: (seq) => set({ selected: Math.max(0, Math.min(seq, get().plan.packets.length - 1)), panel: 'packet' }),
  setPanel: (panel) => set({ panel }),
  reset: () => set({ ...initial, plan: build(KINDS[initial.kind].count, initial.loss) }),
}));
