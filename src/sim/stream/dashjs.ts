// ABR constants copied from dash.js v5.2.1 (tag v5.2.1, 2026-08-17), https://github.com/Dash-Industry-Forum/dash.js
// Every value names the file it came from, so a future upgrade is a diff against that tag, not a guess.
// Paths are relative to src/ in that repository.

/** Pinned so the model is reproducible; bump only together with a re-read of the files below. */
export const DASHJS_VERSION = '5.2.1';

// ---- Dynamic strategy: Throughput and BOLA are never active at the same time ----
// controllers/AbrController.js `_updateDynamicAbrStrategy`, core/Settings.js `abr.hybridSwitchBufferTime`.
// Playback starts on Throughput (`setBolaState(..., bolaRule.active && !_shouldApplyDynamicAbrStrategy())`).
/** Buffer level (s) that switches Throughput → BOLA. */
export const HYBRID_SWITCH_BUFFER_S = 12;
/** Hysteresis: BOLA → Throughput only below half of it. */
export const HYBRID_SWITCH_OFF_S = 0.5 * HYBRID_SWITCH_BUFFER_S;

// ---- Throughput estimate ----
// core/Settings.js `abr.throughput`; controllers/ThroughputController.js `getSafeAverageThroughput`, `getEwma`;
// models/ThroughputModel.js `_updateEwmaValues`.
/** `getSafeAverageThroughput` multiplies the average by this. */
export const BANDWIDTH_SAFETY_FACTOR = 0.9;
/** Default averaging mode is EWMA (not a sliding mean): two estimates, the smaller one wins (`useMin = true`). */
export const EWMA_FAST_HALF_LIFE = 3;
export const EWMA_SLOW_HALF_LIFE = 8;
/** Each sample weighs `factor × downloadTimeMs`, so a 1 s download has weight 1.5. */
export const EWMA_WEIGHT_PER_MS = 0.0015;
// With the Resource Timing API (default on) the download time is responseStart → responseEnd:
// the time to first byte (request RTT, CDN miss) is NOT part of the measured throughput.

// ---- Representation choice ----
// controllers/AbrController.js `getOptimalRepresentationForBitrate`, `getInitialBitrateFor`.
// Highest representation with bitrate ≤ target; nothing fits → the lowest one.
/** Without any measurement and no `initialBitrate` set, dash.js assumes 1000 kbit/s for video. */
export const DEFAULT_VIDEO_BITRATE_KBPS = 1000;

// ---- BOLA (BOLA-O variant), rules/abr/BolaRule.js ----
/** Below this buffer BOLA never adds artificial delay. */
export const BOLA_MINIMUM_BUFFER_S = 10;
export const BOLA_MINIMUM_BUFFER_PER_LEVEL_S = 2;
/** Each loaded segment multiplies the placeholder buffer by this (`_checkNewSegment`). */
export const BOLA_PLACEHOLDER_BUFFER_DECAY = 0.99;
// Utilities: u_i = ln(bitrate_i) − ln(bitrate_0) + 1 (so u_0 = 1).
// bufferTime = max(bufferTimeDefault, MIN + PER_LEVEL × levels); gp = (u_max − 1) / (bufferTime / MIN − 1); Vp = MIN / gp.
// Score_i = (Vp × (u_i − 1 + gp) − (bufferLevel + placeholder)) / bitrate_i; pick the max (ties → higher index).
// Startup state: choose by safe throughput and set placeholder = max(0, minBufferLevelFor(choice) − bufferLevel);
//   steady once bufferLevel ≥ last segment duration.
// Steady: BOLA-O never raises quality above both the current one and the throughput choice;
//   delay = max(0, buffer + placeholder − Vp × (u_q + gp)), taken from the placeholder first.
// Buffer empty (BUFFER_EMPTY) resets the placeholder to 0.
export function bolaParams(bitratesKbps: readonly number[], bufferTimeDefaultS = BUFFER_TIME_DEFAULT_S) {
  const utilities = bitratesKbps.map((b) => Math.log(b) - Math.log(bitratesKbps[0]) + 1);
  const bufferTime = Math.max(bufferTimeDefaultS, BOLA_MINIMUM_BUFFER_S + BOLA_MINIMUM_BUFFER_PER_LEVEL_S * bitratesKbps.length);
  const gp = (utilities[utilities.length - 1] - 1) / (bufferTime / BOLA_MINIMUM_BUFFER_S - 1);
  return { utilities, gp, Vp: BOLA_MINIMUM_BUFFER_S / gp };
}

// ---- Buffer targets (when the player stops requesting) ----
// core/Settings.js `streaming.buffer`; controllers/ScheduleController.js `getBufferTarget`; models/MediaPlayerModel.js.
/** Target below top quality (`bufferTimeDefault`). Also BOLA's bufferTime input. */
export const BUFFER_TIME_DEFAULT_S = 18;
/** Target while playing the top representation (content shorter than 600 s). */
export const BUFFER_TIME_AT_TOP_QUALITY_S = 30;
/** Playback is considered stalled when the buffer drops under this (`buffer.stallThreshold`). */
export const STALL_THRESHOLD_S = 0.3;

// ---- Other default-on rules: the final choice is the MINIMUM across active rules of the same priority ----
// rules/abr/ABRRulesCollection.js `getMinSwitchRequest`.
// InsufficientBufferRule (rules/abr/InsufficientBufferRule.js), active by default:
//   buffer empty → lowest representation until BUFFER_LOADED;
//   otherwise cap = averageThroughput × 0.7 × bufferLevel / segmentDuration (unsafe average, no 0.9 factor);
//   ignored for the first 2 segments.
export const INSUFFICIENT_BUFFER_SAFETY_FACTOR = 0.7;
export const INSUFFICIENT_BUFFER_SEGMENT_IGNORE_COUNT = 2;

// SwitchHistoryRule (rules/abr/SwitchHistoryRule.js + rules/SwitchRequestHistory.js), active by default.
// Every decision pushes {from: current, drop: new < current} into a window of the last SAMPLE_SIZE decisions
// (AbrController `_addSwitchHistoryEntry`). Walking representations low → high and summing drops/noDrops:
// once drops + noDrops ≥ SAMPLE_SIZE and drops / noDrops > THRESHOLD, cap at the representation below the
// one that dropped (or that one, at index 0). Stops a quality that keeps failing from being retried.
export const SWITCH_HISTORY_SAMPLE_SIZE = 8;
export const SWITCH_HISTORY_DROP_THRESHOLD = 0.075;

// AbandonRequestsRule (rules/abr/AbandonRequestsRule.js), active by default, checked DURING a download.
// Skipped when buffer > bufferTimeDefault, at the lowest quality, before MIN_SAMPLES progress traces,
// or before MIN_DOWNLOAD_MS since the first byte. Throughput = bytes after the first trace / time after it.
// Abandon when (bytesTotal × 8 / throughput) ≥ duration × MULTIPLIER and the bytes still missing exceed the
// whole segment at the representation that throughput affords; then re-request at that representation.
// At most once per segment index.
export const ABANDON_DURATION_MULTIPLIER = 1.8;
export const ABANDON_MIN_DOWNLOAD_MS = 500;
export const ABANDON_MIN_SAMPLES = 6;
// After an abandon (controllers/AbrController.js `_onSegmentDownloadShouldBeAbandoned`): the switch history is reset,
// quality changes to the rule's pick, and for `abandonLoadTimeout` only down-switches are applied
// (`checkPlaybackQuality`) while ThroughputRule asks for nothing (it requires ALLOW_LOAD).
export const ABANDON_LOAD_TIMEOUT_S = 10;
// ponytail: dash.js counts XHR progress events (~every 50 ms in browsers); the model counts RTT rounds instead.
// Swap for a 50 ms trace clock if abandon timing on long-RTT paths ever matters.

// All of these rules use SwitchRequest.PRIORITY.DEFAULT (core/Settings.js), so they all enter the same minimum.
