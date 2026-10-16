// Quality of experience up to time t: what the viewer actually got.
import { ENCODE_S, SAMPLE_S } from './engine';
import type { StreamPlan } from './types';

export interface Qoe {
  /** Seconds from pressing play to the first frame; null before it. */
  startupS: number | null;
  stalls: number;
  /** Total time stalled, counting an ongoing stall up to t. */
  stallS: number;
  /** Mean bitrate of the segments already played (kbit/s); null before playback. */
  avgKbps: number | null;
  /** Quality changes between consecutive segments received (abandoned requests never reached the screen). */
  switches: number;
}

export function qoeAt(p: StreamPlan, t: number): Qoe {
  const ladder = p.config.ladderKbps, segDur = p.config.segDur;
  const sample = p.samples[Math.max(0, Math.min(p.samples.length - 1, Math.floor(t / SAMPLE_S + 1e-9)))];
  const stalls = p.stalls.filter((s) => s.from <= t);
  const received = p.attempts.filter((a) => !a.abandoned && a.done <= t);
  const played = received.filter((a) => a.seg * segDur < sample.playhead);
  let switches = 0;
  for (let i = 1; i < received.length; i++) if (received[i].rung !== received[i - 1].rung) switches++;
  return {
    startupS: p.playStart <= t ? p.playStart - ENCODE_S : null,
    stalls: stalls.length,
    stallS: stalls.reduce((sum, s) => sum + (Math.min(Number.isNaN(s.to) ? t : s.to, t) - s.from), 0),
    avgKbps: played.length ? played.reduce((sum, a) => sum + ladder[a.rung], 0) / played.length : null,
    switches,
  };
}
