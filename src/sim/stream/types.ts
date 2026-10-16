import type { Reason } from './abr';
import type { ProfileId } from './profiles';

/** Encode (A) · connect + TLS · manifest (Rede) · startup · adaptive playback · end (B). */
export const STREAM_STAGES = ['encode', 'connect', 'manifest', 'startup', 'playback', 'end'] as const;
export type StreamStage = (typeof STREAM_STAGES)[number];

export interface StreamConfig {
  /** Rung bitrates, kbit/s, ascending. */
  ladderKbps: readonly number[];
  /** Bytes of every segment: `segBytes[rung][segment]`, from the encoder or `nominalSizes`. */
  segBytes: readonly (readonly number[])[];
  segDur: number;
  profile: ProfileId;
  seed: number;
  loss: number;
  /** Segment payload in bytes (the MTU setting). */
  mss: number;
  /** Kenji ↔ CDN edge round trip (cables + last mile), seconds. */
  rttEdge: number;
  /** Edge ↔ origin round trip, seconds. */
  rttOrigin: number;
}

/** One HTTP request for a segment. An abandoned one is followed by another attempt for the same segment. */
export interface Attempt {
  seg: number;
  rung: number;
  request: number;
  firstByte: number;
  /** Finished, or abandoned. */
  done: number;
  bytesTotal: number;
  bytesLoaded: number;
  miss: boolean;
  reason: Reason;
  bufferAtDecision: number;
  cwndStart: number;
  cwndEnd: number;
  losses: number;
  abandoned: boolean;
  /** Measured throughput (first byte → last byte), kbit/s; NaN when abandoned. */
  kbps: number;
}

export type StreamEvent = { t: number } & (
  | { kind: 'encode' | 'connect' | 'tls' | 'manifest' | 'play' | 'stall' | 'end' }
  | { kind: 'request'; seg: number; rung: number; reason: Reason }
  | { kind: 'cache-miss'; seg: number; rung: number; prefetchTo: number }
  | { kind: 'cache-hit'; seg: number; rung: number }
  | { kind: 'lost'; seg: number; cause: 'random' | 'queue'; cwnd: number }
  | { kind: 'abandon'; seg: number; from: number; to: number; wastedBytes: number }
  | { kind: 'segment'; seg: number; rung: number; bytes: number; kbps: number; losses: number }
  | { kind: 'resume'; stalledFor: number }
  | { kind: 'idle-restart'; from: number; to: number }
  | { kind: 'rule'; bola: boolean; buffer: number }
  | { kind: 'bola-wait'; delay: number }
);

/** State every SAMPLE_S seconds, for the chart and the HUD. */
export interface Sample {
  bwMbps: number;
  buffer: number;
  playhead: number;
  stalled: boolean;
  /** Last measured segment throughput, kbit/s (NaN before the first). */
  thrKbps: number;
  /** dash.js safe estimate (EWMA × 0.9), kbit/s. */
  estKbps: number;
  cwnd: number;
  bola: boolean;
}

export interface StreamPlan {
  config: StreamConfig;
  attempts: Attempt[];
  samples: Sample[];
  stalls: { from: number; to: number }[];
  /** Thinned (≥ 0.5 s apart) for the globe; every loss still counts in its attempt. */
  losses: { t: number; seg: number; cause: 'random' | 'queue' }[];
  /** What the edge holds from when: a miss fetches `from` and prefetches up to `to`, same rung. */
  cache: { rung: number; from: number; to: number; t: number }[];
  events: StreamEvent[];
  /** Start time of each STREAM_STAGES entry. */
  stageStart: number[];
  playStart: number;
  playEnd: number;
  end: number;
}

export interface StreamSnapshot {
  t: number;
  stage: number;
  sample: Sample;
  /** The request in flight, if any; `progress` is the share of the segment's bytes delivered. */
  download: (Attempt & { phase: 'request' | 'origin' | 'transfer'; progress: number }) | null;
  /** Rung of the segment under the playhead, or -1 before playback. */
  playingRung: number;
  /** Successful attempts finished by t, in order. */
  completed: Attempt[];
}
