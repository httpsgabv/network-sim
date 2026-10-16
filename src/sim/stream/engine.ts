// On-demand streaming as a function of time: `planStream` runs the whole session once (TCP rounds, dash.js ABR,
// CDN edge, playback buffer); `streamSnapshot(plan, t)` is a lookup. Times are seconds from Kenji's phone
// starting the encode stage; Kenji presses play at ENCODE_S.
import { decide, newAbr, onAbandon, onBufferEmpty, onSegmentLoaded, shouldAbandon, updateDynamic, type Reason } from './abr';
import { BANDWIDTH_SAFETY_FACTOR, BUFFER_TIME_AT_TOP_QUALITY_S, BUFFER_TIME_DEFAULT_S, STALL_THRESHOLD_S } from './dashjs';
import { addSample, estimate, newEwma } from './ewma';
import { mulberry32 } from '../prng';
import { PROFILES } from './profiles';
import { afterIdle, newConnection, round } from './tcp';
import { STREAM_STAGES, type Attempt, type Sample, type StreamConfig, type StreamEvent, type StreamPlan, type StreamSnapshot } from './types';

/** The encode stage is a fixed slot on the clock; the real encode runs off-clock (plan.md). */
export const ENCODE_S = 2;
export const SAMPLE_S = 0.1;
/** Kenji's access network adds this to the cable round trip (home Wi-Fi / mobile to the ISP). */
export const LAST_MILE_RTT_S = 0.01;
/** Playback integration step. */
const STEP_S = 0.01;
/** dash.js `scheduling.defaultTimeout`: how often the scheduler re-checks a full buffer. */
const SCHEDULE_TIMEOUT_S = 0.5;
/** On a miss the edge also fetches the next segments of that rung (spec Decision 5). */
export const PREFETCH = 3;
// ponytail: the edge pulls from the origin at a fixed 100 Mbps, store-and-forward; real CDNs stream through
// (cut-through) on fatter links. Model the backbone if origin fetch time ever needs to be exact.
const ORIGIN_EDGE_BPS = 100e6 / 8;
/** The final state stays on screen a moment after the last frame. */
const TAIL_S = 1.5;
/** Losses closer than this share one marker on the globe. */
const LOSS_MARK_GAP_S = 0.5;
/** Safety net against a modelling bug turning into an endless loop. */
const MAX_SESSION_S = 900;
const BOLA_WAIT_LIMIT = 50;

/** Sizes for a ladder before the encoder reports real ones: bitrate × duration, ±18 % like VBR output. */
export function nominalSizes(ladderKbps: readonly number[], segments: number, segDur: number, seed: number): number[][] {
  const rand = mulberry32(seed);
  return ladderKbps.map((kbps) => Array.from({ length: segments }, () => Math.round(kbps * 125 * segDur * (0.82 + 0.36 * rand()))));
}

function validate(c: StreamConfig) {
  const { ladderKbps: l, segBytes } = c;
  if (l.length < 1 || l.some((b, i) => !(b > 0) || (i > 0 && b <= l[i - 1]))) throw new RangeError('ladderKbps must be positive and ascending');
  const segments = segBytes[0]?.length ?? 0;
  if (segBytes.length !== l.length || segments < 1 || segBytes.some((row) => row.length !== segments || row.some((b) => !(b > 0)))) {
    throw new RangeError('segBytes must be [rung][segment] with positive sizes for every rung');
  }
  if (!(c.loss >= 0 && c.loss <= 1)) throw new RangeError(`loss must be in [0, 1], got ${c.loss}`);
  if (!(c.mss > 0) || !(c.segDur > 0) || !(c.rttEdge > 0) || !(c.rttOrigin >= 0)) throw new RangeError('mss, segDur and rttEdge must be positive; rttOrigin non-negative');
}

export function planStream(c: StreamConfig): StreamPlan {
  validate(c);
  const ladder = c.ladderKbps, top = ladder.length - 1, segments = c.segBytes[0].length, total = segments * c.segDur;
  const rand = mulberry32(c.seed);
  const bwMbps = (t: number) => PROFILES[c.profile].bwMbps(Math.max(0, t - ENCODE_S), c.seed);

  const attempts: Attempt[] = [], samples: Sample[] = [], events: StreamEvent[] = [];
  const stalls: StreamPlan['stalls'] = [], losses: StreamPlan['losses'] = [], cache: StreamPlan['cache'] = [];
  let t = 0, buffer = 0, playhead = 0, started = false, stalled = false, ended = false, wasEmpty = true;
  let playStart = NaN, playEnd = NaN, lastThr = NaN, lastLossMark = -Infinity;
  let abr = newAbr(ladder), ewma = newEwma(), tcp = newConnection();
  const safeKbps = () => estimate(ewma) * BANDWIDTH_SAFETY_FACTOR;

  function advance(dt: number) {
    const stop = t + dt;
    while (t < stop - 1e-12) {
      const step = Math.min(STEP_S, stop - t);
      if (started && !stalled && !ended) {
        const d = Math.min(step, buffer);
        playhead += d; buffer -= d;
        if (playhead >= total - 1e-9) { playhead = total; ended = true; playEnd = t + d; events.push({ t: playEnd, kind: 'end' }); }
        else if (buffer <= 1e-9) { buffer = 0; stalled = true; stalls.push({ from: t + d, to: NaN }); events.push({ t: t + d, kind: 'stall' }); }
      }
      // BufferController: BUFFER_EMPTY under the stall threshold (edge-triggered), BUFFER_LEVEL feeds the Dynamic switch
      const empty = buffer < STALL_THRESHOLD_S && !ended;
      if (empty && !wasEmpty && started) abr = onBufferEmpty(abr);
      wasEmpty = empty;
      const bola = abr.bolaActive;
      abr = updateDynamic(abr, buffer);
      if (abr.bolaActive !== bola) events.push({ t, kind: 'rule', bola: abr.bolaActive, buffer });
      t += step;
      while (samples.length * SAMPLE_S <= t + 1e-9) {
        samples.push({ bwMbps: bwMbps(samples.length * SAMPLE_S), buffer, playhead, stalled, thrKbps: lastThr, estKbps: safeKbps(), cwnd: tcp.cwnd, bola: abr.bolaActive });
      }
      if (t > MAX_SESSION_S) throw new Error('stream session did not finish');
    }
  }

  events.push({ t: 0, kind: 'encode' });
  advance(ENCODE_S);
  advance(c.rttEdge); events.push({ t, kind: 'connect' });
  advance(c.rttEdge); events.push({ t, kind: 'tls' });
  const tlsEnd = t;
  // The manifest is a miss too: the edge asks the origin (MPD requests don't feed the throughput estimate).
  advance(c.rttEdge + c.rttOrigin); events.push({ t, kind: 'manifest' });
  const manifestEnd = t;
  /** When the connection last carried data; the idle gap until the next request decides the slow-start restart. */
  let lastSend = t;

  for (let seg = 0; seg < segments; seg++) {
    // ScheduleController._shouldBuffer: request while buffer + one segment < target (30 s at the top rung, else 18 s)
    const target = () => (abr.current === top ? BUFFER_TIME_AT_TOP_QUALITY_S : BUFFER_TIME_DEFAULT_S);
    while (buffer + c.segDur >= target()) advance(SCHEDULE_TIMEOUT_S);

    let d = decide(abr, { ladder, now: t, buffer, bufferEmpty: buffer < STALL_THRESHOLD_S, safeKbps: safeKbps(), avgKbps: estimate(ewma), segDur: c.segDur });
    for (let n = 0; d.delayS > 0 && n < BOLA_WAIT_LIMIT; n++) {
      abr = d.state;
      events.push({ t, kind: 'bola-wait', delay: d.delayS });
      advance(d.delayS);
      d = decide(abr, { ladder, now: t, buffer, bufferEmpty: buffer < STALL_THRESHOLD_S, safeKbps: safeKbps(), avgKbps: estimate(ewma), segDur: c.segDur });
    }
    abr = d.state;
    let rung = d.index, reason: Reason = d.reason, bufferAtDecision = buffer, abandonedOnce = false;
    events.push({ t, kind: 'request', seg, rung, reason });

    for (;;) {
      const request = t, bytesTotal = c.segBytes[rung][seg];
      const before = tcp.cwnd;
      tcp = afterIdle(tcp, t - lastSend, c.rttEdge);
      if (tcp.cwnd < before) events.push({ t, kind: 'idle-restart', from: before, to: tcp.cwnd });
      advance(c.rttEdge / 2);
      const miss = !cache.some((e) => e.rung === rung && seg >= e.from && seg <= e.to && e.t < request);
      if (miss) {
        const prefetchTo = Math.min(segments - 1, seg + PREFETCH);
        events.push({ t, kind: 'cache-miss', seg, rung, prefetchTo });
        advance(c.rttOrigin + bytesTotal / ORIGIN_EDGE_BPS);
        cache.push({ rung, from: seg, to: prefetchTo, t });
      } else events.push({ t, kind: 'cache-hit', seg, rung });
      advance(c.rttEdge / 2);

      const firstByte = t, cwndStart = tcp.cwnd;
      let loaded = 0, rounds = 0, nLoss = 0, firstRoundBytes = 0, firstRoundEnd = t, abandonTo = -1, abandonKbps = NaN;
      while (loaded < bytesTotal) {
        const r = round(tcp, { bwBps: bwMbps(t) * 125000, rtt: c.rttEdge, mss: c.mss, remaining: bytesTotal - loaded, loss: c.loss, rand });
        tcp = r.state;
        advance(r.duration);
        loaded += r.delivered;
        if (++rounds === 1) { firstRoundBytes = r.delivered; firstRoundEnd = t; }
        if (r.lost) {
          if (++nLoss === 1) events.push({ t, kind: 'lost', seg, cause: r.lost, cwnd: tcp.cwnd });
          if (t - lastLossMark >= LOSS_MARK_GAP_S) { losses.push({ t, seg, cause: r.lost }); lastLossMark = t; }
        }
        const a = shouldAbandon({
          ladder, index: rung, buffer, segDur: c.segDur, rounds, msSinceFirstByte: (t - firstByte) * 1000,
          bytesLoaded: loaded, bytesTotal, bytesAfterFirstTrace: loaded - firstRoundBytes, msAfterFirstTrace: (t - firstRoundEnd) * 1000, abandoned: abandonedOnce,
        });
        if (a) { abandonTo = a.index; abandonKbps = a.kbps; break; }
      }
      lastSend = t;
      const abandoned = abandonTo >= 0;
      const kbps = abandoned ? NaN : (bytesTotal * 8) / ((t - firstByte) * 1000);
      attempts.push({
        seg, rung, request, firstByte, done: t, bytesTotal, bytesLoaded: Math.min(loaded, bytesTotal), miss, reason,
        bufferAtDecision, cwndStart, cwndEnd: tcp.cwnd, losses: nLoss, abandoned, kbps,
      });
      if (abandoned) {
        events.push({ t, kind: 'abandon', seg, from: rung, to: abandonTo, wastedBytes: loaded });
        abr = onAbandon(abr, { ladder, index: abandonTo, buffer, now: t });
        rung = abandonTo; abandonedOnce = true; bufferAtDecision = buffer;
        reason = { rule: 'abandon', safeKbps: abandonKbps };
        events.push({ t, kind: 'request', seg, rung, reason });
        continue;
      }
      // Resource Timing: responseStart → responseEnd, so the request RTT and the origin fetch are not in the measurement
      ewma = addSample(ewma, kbps, (t - firstByte) * 1000);
      lastThr = kbps;
      buffer += c.segDur;
      abr = { ...onSegmentLoaded(abr, { ladder, now: t, request, durationS: c.segDur, buffer }), current: rung };
      events.push({ t, kind: 'segment', seg, rung, bytes: bytesTotal, kbps, losses: nLoss });
      if (!started) { started = true; playStart = t; events.push({ t, kind: 'play' }); }
      else if (stalled) {
        stalled = false;
        const s = stalls[stalls.length - 1];
        s.to = t;
        events.push({ t, kind: 'resume', stalledFor: t - s.from });
      }
      break;
    }
  }
  while (!ended) advance(SCHEDULE_TIMEOUT_S);
  advance(TAIL_S);

  return {
    config: c, attempts, samples, stalls, losses, cache, events,
    stageStart: [0, ENCODE_S, tlsEnd, manifestEnd, playStart, playEnd], playStart, playEnd, end: t,
  };
}

export function streamSnapshot(p: StreamPlan, t: number): StreamSnapshot {
  const tt = Math.min(Math.max(t, 0), p.end);
  const sample = p.samples[Math.min(p.samples.length - 1, Math.floor(tt / SAMPLE_S + 1e-9))];
  const stage = streamStageAt(p, tt);
  const a = p.attempts.find((x) => tt >= x.request && tt < x.done);
  let download: StreamSnapshot['download'] = null;
  if (a) {
    const half = p.config.rttEdge / 2;
    const phase = tt >= a.firstByte ? 'transfer' : a.miss && tt >= a.request + half && tt < a.firstByte - half ? 'origin' : 'request';
    const progress = phase === 'transfer' ? ((tt - a.firstByte) / (a.done - a.firstByte)) * (a.bytesLoaded / a.bytesTotal) : 0;
    download = { ...a, phase, progress };
  }
  const completed = p.attempts.filter((x) => !x.abandoned && x.done <= tt);
  const seg = Math.min(p.config.segBytes[0].length - 1, Math.floor(sample.playhead / p.config.segDur));
  const playingRung = tt >= p.playStart ? completed.find((x) => x.seg === seg)?.rung ?? -1 : -1;
  return { t: tt, stage, sample, download, playingRung, completed };
}

/** Index into STREAM_STAGES at time t. */
export function streamStageAt(p: StreamPlan, t: number): number {
  let stage = 0;
  for (let i = 0; i < STREAM_STAGES.length; i++) if (t >= p.stageStart[i]) stage = i;
  return stage;
}

/** Scrubber position: 100 per stage, so short stages (TLS, manifest) stay grabbable next to a 30 s playback. */
export function streamStagePos(p: StreamPlan, t: number): number {
  if (t >= p.end) return STREAM_STAGES.length * 100;
  const i = streamStageAt(p, Math.max(0, t)), from = p.stageStart[i], to = p.stageStart[i + 1] ?? p.end;
  return i * 100 + (to > from ? ((Math.max(0, t) - from) / (to - from)) * 100 : 100);
}

export function streamStageTime(p: StreamPlan, pos: number): number {
  if (pos >= STREAM_STAGES.length * 100) return p.end;
  const i = Math.max(0, Math.floor(pos / 100)), from = p.stageStart[i], to = p.stageStart[i + 1] ?? p.end;
  return from + ((pos - i * 100) / 100) * (to - from);
}
