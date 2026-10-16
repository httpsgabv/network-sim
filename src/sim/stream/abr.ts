// The dash.js v5.2.1 ABR decision, as pure functions over an immutable state.
// One `decide()` = one `AbrController.checkPlaybackQuality`: Throughput or BOLA (Dynamic), InsufficientBufferRule and
// SwitchHistoryRule each may ask for a rung; the lowest wins (`getMinSwitchRequest`, all DEFAULT priority).
// The events dash.js reacts to between decisions are the `on*` functions; the engine calls them in order.
import {
  ABANDON_DURATION_MULTIPLIER, ABANDON_LOAD_TIMEOUT_S, ABANDON_MIN_DOWNLOAD_MS, ABANDON_MIN_SAMPLES,
  BOLA_MINIMUM_BUFFER_S, BOLA_PLACEHOLDER_BUFFER_DECAY, BUFFER_TIME_DEFAULT_S, DEFAULT_VIDEO_BITRATE_KBPS,
  HYBRID_SWITCH_BUFFER_S, HYBRID_SWITCH_OFF_S, INSUFFICIENT_BUFFER_SAFETY_FACTOR, INSUFFICIENT_BUFFER_SEGMENT_IGNORE_COUNT,
  SWITCH_HISTORY_DROP_THRESHOLD, SWITCH_HISTORY_SAMPLE_SIZE, bolaParams,
} from './dashjs';

export type RuleId = 'throughput' | 'bola' | 'insufficient-buffer' | 'switch-history' | 'none';

/** Why a rung was chosen: data only; `lib/describe` turns it into pt-BR text. */
export interface Reason {
  rule: RuleId;
  safeKbps?: number;
  capKbps?: number;
  bufferS?: number;
  placeholder?: number;
  phase?: BolaState['phase'];
}

export interface BolaState {
  phase: 'startup' | 'steady';
  /** Virtual seconds of buffer BOLA adds so non-network waits don't lower its choice. */
  placeholder: number;
  lastSegDur: number | null;
  lastFinish: number | null;
  lastCall: number | null;
}

export interface AbrState {
  /** Dynamic strategy: BOLA instead of Throughput. */
  bolaActive: boolean;
  /** Index of the rung being downloaded/played. */
  current: number;
  /** Created the first time BOLA is consulted, like dash.js `_getBolaState`. */
  bola: BolaState | null;
  /** Last decisions, newest last: the rung we were on and whether the decision lowered it. */
  history: { from: number; drop: boolean }[];
  /** InsufficientBufferRule stays quiet until this many segments were appended. */
  ignoreCount: number;
  /** After an abandon, until this time only down-switches apply. */
  abandonUntil: number | null;
}

export interface DecideIn {
  /** Rung bitrates in kbit/s, ascending. */
  ladder: readonly number[];
  now: number;
  buffer: number;
  /** dash.js BUFFER_EMPTY state (buffer under the stall threshold). */
  bufferEmpty: boolean;
  /** EWMA × 0.9; NaN before any measurement. */
  safeKbps: number;
  /** EWMA without the safety factor (InsufficientBufferRule uses this one). */
  avgKbps: number;
  segDur: number;
}

export interface Decision {
  index: number;
  reason: Reason;
  /** BOLA asking the scheduler to wait before the next request (ScheduleController.setTimeToLoadDelay). */
  delayS: number;
  state: AbrState;
}

/** AbrController.getOptimalRepresentationForBitrate: highest rung ≤ target, else the lowest. */
export function optimalFor(ladder: readonly number[], kbps: number): number {
  if (!(kbps > 0)) return 0;
  let best = 0;
  ladder.forEach((b, i) => { if (b <= kbps) best = i; });
  return best;
}

export const newAbr = (ladder: readonly number[], initialKbps = DEFAULT_VIDEO_BITRATE_KBPS): AbrState => ({
  bolaActive: false, current: optimalFor(ladder, initialKbps), bola: null, history: [],
  ignoreCount: INSUFFICIENT_BUFFER_SEGMENT_IGNORE_COUNT, abandonUntil: null,
});

/** Runs on every buffer-level update, with hysteresis so the rules don't oscillate. */
export function updateDynamic(s: AbrState, buffer: number): AbrState {
  const bolaActive = buffer >= (s.bolaActive ? HYBRID_SWITCH_OFF_S : HYBRID_SWITCH_BUFFER_S);
  return bolaActive === s.bolaActive ? s : { ...s, bolaActive };
}

/** BolaRule `_minBufferLevelForRepresentation`: the buffer level from which rung q beats every lower one. */
export function minBufferLevelFor(ladder: readonly number[], q: number): number {
  const { utilities: u, gp, Vp } = bolaParams(ladder);
  let min = 0;
  for (let i = q - 1; i >= 0; i--) {
    if (u[i] < u[q]) min = Math.max(min, Vp * (gp + (ladder[q] * u[i] - ladder[i] * u[q]) / (ladder[q] - ladder[i])));
  }
  return min;
}

const maxBufferLevelFor = (ladder: readonly number[], q: number) => {
  const { utilities: u, gp, Vp } = bolaParams(ladder);
  return Vp * (u[q] + gp);
};

function bolaChoice(ladder: readonly number[], level: number): number {
  const { utilities: u, gp, Vp } = bolaParams(ladder);
  let best = 0, score = -Infinity;
  ladder.forEach((b, i) => {
    const sc = (Vp * (u[i] - 1 + gp) - level) / b;
    if (sc >= score) { score = sc; best = i; }
  });
  return best;
}

type Request = { index: number; reason: Reason };

function bolaRule(s: AbrState, i: DecideIn): { request: Request | null; bola: BolaState; delayS: number } {
  const b0: BolaState = s.bola ?? { phase: 'startup', placeholder: 0, lastSegDur: null, lastFinish: null, lastCall: null };
  if (b0.phase === 'startup') {
    if (isNaN(i.safeKbps)) return { request: null, bola: b0, delayS: 0 };
    const index = optimalFor(i.ladder, i.safeKbps);
    const bola: BolaState = {
      ...b0,
      placeholder: Math.max(0, minBufferLevelFor(i.ladder, index) - i.buffer),
      phase: b0.lastSegDur !== null && i.buffer >= b0.lastSegDur ? 'steady' : 'startup',
    };
    return { request: { index, reason: { rule: 'bola', phase: 'startup', safeKbps: i.safeKbps, bufferS: i.buffer, placeholder: bola.placeholder } }, bola, delayS: 0 };
  }
  // _updatePlaceholderBuffer: time spent not downloading (waiting for room, BOLA delays) must not lower the choice
  const since = b0.lastFinish ?? b0.lastCall;
  let placeholder = b0.placeholder + (since === null ? 0 : Math.max(0, i.now - since));
  let index = bolaChoice(i.ladder, i.buffer + placeholder);
  // BOLA-O: never climb to a rung above both the current one and what the throughput sustains
  const forThroughput = optimalFor(i.ladder, i.safeKbps);
  if (index > s.current && index > forThroughput) index = forThroughput > s.current ? forThroughput : s.current;
  let delayS = Math.max(0, i.buffer + placeholder - maxBufferLevelFor(i.ladder, index));
  if (delayS <= placeholder) { placeholder -= delayS; delayS = 0; }
  else {
    delayS -= placeholder;
    placeholder = 0;
    if (index === i.ladder.length - 1) delayS = 0; // at the top, the buffer target decides how far to fill
  }
  const bola: BolaState = { ...b0, placeholder, lastCall: i.now, lastFinish: null };
  return { request: { index, reason: { rule: 'bola', phase: 'steady', safeKbps: i.safeKbps, bufferS: i.buffer, placeholder } }, bola, delayS };
}

function insufficientBufferRule(s: AbrState, i: DecideIn): Request | null {
  if (s.ignoreCount > 0) return null;
  if (i.bufferEmpty) return { index: 0, reason: { rule: 'insufficient-buffer', capKbps: 0, bufferS: i.buffer } };
  const capKbps = i.avgKbps * INSUFFICIENT_BUFFER_SAFETY_FACTOR * i.buffer / i.segDur;
  if (!(capKbps > 0)) return null;
  return { index: optimalFor(i.ladder, capKbps), reason: { rule: 'insufficient-buffer', capKbps, bufferS: i.buffer } };
}

/** SwitchHistoryRule: walk rungs low → high with running totals; cap below the first rung whose drops dominate. */
function switchHistoryRule(s: AbrState, rungs: number): Request | null {
  let drops = 0, noDrops = 0;
  for (let r = 0; r < rungs; r++) {
    const own = s.history.filter((h) => h.from === r);
    if (own.length === 0) continue;
    const ownDrops = own.filter((h) => h.drop).length;
    drops += ownDrops;
    noDrops += own.length - ownDrops;
    if (drops + noDrops >= SWITCH_HISTORY_SAMPLE_SIZE && drops / noDrops > SWITCH_HISTORY_DROP_THRESHOLD) {
      return { index: r > 0 && ownDrops > 0 ? r - 1 : r, reason: { rule: 'switch-history' } };
    }
  }
  return null;
}

export function decide(s: AbrState, i: DecideIn): Decision {
  const allowLoad = s.abandonUntil === null || i.now >= s.abandonUntil;
  const requests: Request[] = [];
  let bola = s.bola, delayS = 0;

  if (s.bolaActive) {
    const r = bolaRule(s, i);
    bola = r.bola; delayS = r.delayS;
    if (r.request) requests.push(r.request);
  } else if (allowLoad && !i.bufferEmpty && !isNaN(i.safeKbps)) {
    requests.push({ index: optimalFor(i.ladder, i.safeKbps), reason: { rule: 'throughput', safeKbps: i.safeKbps } });
  }
  const ibr = insufficientBufferRule(s, i);
  if (ibr) requests.push(ibr);
  const sh = switchHistoryRule(s, i.ladder.length);
  if (sh) requests.push(sh);

  if (requests.length === 0) return { index: s.current, reason: { rule: 'none' }, delayS, state: { ...s, bola } };

  const min = requests.reduce((a, b) => (b.index < a.index ? b : a));
  const history = [...s.history, { from: s.current, drop: min.index < s.current }].slice(-SWITCH_HISTORY_SAMPLE_SIZE);
  // During ABANDON_LOAD only down-switches apply (checkPlaybackQuality)
  const index = allowLoad || min.index < s.current ? min.index : s.current;
  return { index, reason: min.reason, delayS, state: { ...s, bola, history, current: index } };
}

/** A segment finished and was appended (MEDIA_FRAGMENT_LOADED + HTTP_REQUEST metric + BYTES_APPENDED). */
export function onSegmentLoaded(s: AbrState, e: { ladder: readonly number[]; now: number; request: number; durationS: number; buffer: number }): AbrState {
  const ignoreCount = Math.max(0, s.ignoreCount - 1);
  if (!s.bola) return { ...s, ignoreCount };
  // _checkNewSegment: decay, then cap at what the last rung's maximum allowed at request time (buffer estimate as dash.js)
  const bufferAtRequest = e.buffer + (e.now - e.request);
  const placeholder = Math.min(s.bola.placeholder * BOLA_PLACEHOLDER_BUFFER_DECAY, Math.max(0, maxBufferLevelFor(e.ladder, s.current) - bufferAtRequest));
  return { ...s, ignoreCount, bola: { ...s.bola, placeholder, lastSegDur: e.durationS, lastFinish: e.now } };
}

/** BUFFER_EMPTY: a stall wipes BOLA's virtual buffer. */
export function onBufferEmpty(s: AbrState): AbrState {
  return s.bola?.phase === 'steady' ? { ...s, bola: { ...s.bola, placeholder: 0 } } : s;
}

export interface AbandonIn {
  ladder: readonly number[];
  /** Rung of the download in progress. */
  index: number;
  buffer: number;
  segDur: number;
  /** Progress traces so far (RTT rounds in this model; see dashjs.ts). */
  rounds: number;
  msSinceFirstByte: number;
  bytesLoaded: number;
  bytesTotal: number;
  /** Bytes and time after the first trace, which still carries the request latency. */
  bytesAfterFirstTrace: number;
  msAfterFirstTrace: number;
  abandoned: boolean;
}

/** AbandonRequestsRule.shouldAbandon: the rung to re-request at, or null to keep downloading. */
export function shouldAbandon(i: AbandonIn): { index: number; kbps: number } | null {
  if (i.abandoned || i.buffer > BUFFER_TIME_DEFAULT_S) return null;
  if (!(i.rounds >= ABANDON_MIN_SAMPLES && i.msSinceFirstByte > ABANDON_MIN_DOWNLOAD_MS && i.bytesLoaded < i.bytesTotal)) return null;
  const kbps = Math.round((8 * i.bytesAfterFirstTrace) / Math.max(i.msAfterFirstTrace, 1));
  const estimatedS = (i.bytesTotal * 8) / kbps / 1000;
  if (estimatedS < i.segDur * ABANDON_DURATION_MULTIPLIER || i.index === 0) return null;
  const index = optimalFor(i.ladder, kbps);
  const wholeAtNew = (i.bytesTotal * i.ladder[index]) / i.ladder[i.index];
  return i.bytesTotal - i.bytesLoaded > wholeAtNew ? { index, kbps } : null;
}

/** After an abandon: quality changes first (BOLA follows it), then the abandon event deflates BOLA's placeholder. */
export function onAbandon(s: AbrState, e: { ladder: readonly number[]; index: number; buffer: number; now: number }): AbrState {
  let bola = s.bola;
  if (bola) {
    const want = e.index > 0 ? minBufferLevelFor(e.ladder, e.index) : BOLA_MINIMUM_BUFFER_S;
    bola = { ...bola, placeholder: Math.min(bola.placeholder, Math.max(0, want - e.buffer)) };
  }
  return { ...s, current: e.index, history: [], bola, abandonUntil: e.now + ABANDON_LOAD_TIMEOUT_S };
}
