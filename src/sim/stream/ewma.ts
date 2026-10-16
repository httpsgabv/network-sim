// dash.js throughput estimate: two exponentially weighted moving averages, weighted by download time.
// models/ThroughputModel.js `_updateEwmaValues`, controllers/ThroughputController.js `getEwma` (v5.2.1).
import { EWMA_FAST_HALF_LIFE, EWMA_SLOW_HALF_LIFE, EWMA_WEIGHT_PER_MS } from './dashjs';

export interface Ewma {
  fast: number;
  slow: number;
  totalWeight: number;
}

export const newEwma = (): Ewma => ({ fast: 0, slow: 0, totalWeight: 0 });

/** Adds one segment's measurement; a longer download weighs more (`weightDownloadTimeMultiplicationFactor`). */
export function addSample(e: Ewma, kbps: number, downloadMs: number): Ewma {
  const weight = EWMA_WEIGHT_PER_MS * downloadMs;
  const fastAlpha = Math.pow(0.5, weight / EWMA_FAST_HALF_LIFE);
  const slowAlpha = Math.pow(0.5, weight / EWMA_SLOW_HALF_LIFE);
  return {
    fast: (1 - fastAlpha) * kbps + fastAlpha * e.fast,
    slow: (1 - slowAlpha) * kbps + slowAlpha * e.slow,
    totalWeight: e.totalWeight + weight,
  };
}

/** kbit/s, or NaN before any sample. Both estimates start at 0, so each is divided by its startup bias; the smaller wins. */
export function estimate(e: Ewma): number {
  if (e.totalWeight <= 0) return NaN;
  const fast = e.fast / (1 - Math.pow(0.5, e.totalWeight / EWMA_FAST_HALF_LIFE));
  const slow = e.slow / (1 - Math.pow(0.5, e.totalWeight / EWMA_SLOW_HALF_LIFE));
  return Math.min(fast, slow);
}
