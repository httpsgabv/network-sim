// What the Streaming side cards show (A · Escada, B · Buffer), as pure functions of the plan and its snapshot.
import { RUNG_LABEL } from '../copy';
import { BUFFER_TIME_AT_TOP_QUALITY_S, BUFFER_TIME_DEFAULT_S, HYBRID_SWITCH_BUFFER_S, HYBRID_SWITCH_OFF_S } from '../sim/stream/dashjs';
import { ENCODE_S } from '../sim/stream/engine';
import { STREAM_STAGES, type StreamPlan, type StreamSnapshot } from '../sim/stream/types';
import { mbps } from './describe';

/** Precedence, strongest first: what Kenji has beats what is in flight beats what the edge holds. */
export type LadderCell = 'transit' | 'got' | 'abandoned' | 'edge' | 'origin' | 'pending';

export interface LadderRow { rung: number; label: string; rate: string; cells: LadderCell[] }

/** Rows top → bottom = 1080p → 240p; one cell per 2 s segment. */
export function ladderRows(plan: StreamPlan, snap: StreamSnapshot): LadderRow[] {
  const { ladderKbps, segBytes } = plan.config, n = segBytes[0].length, t = snap.t, d = snap.download;
  const done = plan.attempts.filter((a) => a.done <= t);
  return ladderKbps.map((kbps, rung) => ({
    rung, label: RUNG_LABEL[rung] ?? `${kbps} kbps`, rate: mbps(kbps),
    cells: Array.from({ length: n }, (_, seg): LadderCell => {
      if (d && d.seg === seg && d.rung === rung) return 'transit';
      const own = done.filter((a) => a.seg === seg && a.rung === rung);
      if (own.some((a) => !a.abandoned)) return 'got';
      if (own.length) return 'abandoned';
      if (plan.cache.some((c) => c.rung === rung && seg >= c.from && seg <= c.to && c.t <= t)) return 'edge';
      // the encoder writes segments in time order, every rung in parallel, during the encode stage
      return t >= ((seg + 1) / n) * ENCODE_S ? 'origin' : 'pending';
    }),
  })).reverse();
}

export function ladderDesc(plan: StreamPlan, snap: StreamSnapshot): string {
  if (snap.t < ENCODE_S) return 'codificando…';
  const atEdge = ladderRows(plan, snap).reduce((sum, r) => sum + r.cells.filter((c) => c === 'edge').length, 0);
  return `${plan.config.ladderKbps.length} × ${plan.config.segBytes[0].length} seg · ${atEdge} na borda`;
}

/** The track spans the top-quality target plus the segment that may be arriving. */
export const BUFFER_VIEW_S = BUFFER_TIME_AT_TOP_QUALITY_S + 2;
export const BUFFER_MARKS = [
  { at: BUFFER_TIME_DEFAULT_S, label: 'alvo' },
  { at: BUFFER_TIME_AT_TOP_QUALITY_S, label: 'alvo 1080p' },
] as const;

export interface BufferBlock { seg: number; rung: number; label: string; start: number; width: number; arriving: boolean }

/** Seconds of video ahead of the playhead (start/width in seconds from it), and the segment still arriving. */
export function bufferBlocks(plan: StreamPlan, snap: StreamSnapshot): BufferBlock[] {
  const dur = plan.config.segDur, ph = snap.sample.playhead, blocks: BufferBlock[] = [];
  const clip = (start: number, width: number) => Math.max(0, Math.min(width, BUFFER_VIEW_S - start));
  for (const a of snap.completed) {
    const from = Math.max(a.seg * dur, ph), to = (a.seg + 1) * dur;
    if (to <= ph + 1e-9 || from - ph >= BUFFER_VIEW_S) continue;
    blocks.push({ seg: a.seg, rung: a.rung, label: RUNG_LABEL[a.rung], start: from - ph, width: clip(from - ph, to - from), arriving: false });
  }
  const d = snap.download;
  if (d?.phase === 'transfer') {
    const start = Math.max(0, d.seg * dur - ph);
    if (start < BUFFER_VIEW_S) blocks.push({ seg: d.seg, rung: d.rung, label: RUNG_LABEL[d.rung], start, width: clip(start, d.progress * dur), arriving: true });
  }
  return blocks;
}

const f1 = (n: number) => n.toFixed(1).replace('.', ',');

export function bufferDesc(plan: StreamPlan, snap: StreamSnapshot): string {
  return snap.t < plan.playStart ? 'vazio' : `${f1(snap.sample.buffer)} s à frente`;
}

export function bufferNote(plan: StreamPlan, snap: StreamSnapshot): string {
  if (snap.t < plan.playStart) return 'O vídeo começa quando o 1º segmento chega. Cada segmento soma 2 s; tocar gasta 1 s por segundo.';
  if (STREAM_STAGES[snap.stage] === 'end') return 'Vídeo assistido até o fim: o buffer esvaziou tocando, não travando.';
  if (snap.sample.stalled) return 'Nada à frente da reprodução: o vídeo congela e o player espera o segmento em trânsito.';
  if (!snap.download) {
    return `Buffer no alvo: o player só pede o próximo quando couberem mais 2 s (alvo de ${BUFFER_TIME_DEFAULT_S} s, ou ${BUFFER_TIME_AT_TOP_QUALITY_S} s em 1080p).`;
  }
  return `Altura do bloco = qualidade. Com ${HYBRID_SWITCH_BUFFER_S} s ou mais o ABR decide pelo buffer (BOLA); abaixo de ${HYBRID_SWITCH_OFF_S} s, volta ao throughput.`;
}
