import { memo } from 'react';
import { bufferBlocks, bufferDesc, bufferNote, BUFFER_MARKS, BUFFER_VIEW_S, ladderDesc, ladderRows } from '../../lib/streamCards';
import { useStreamSnapshot } from '../../lib/useSim';
import { useSim } from '../../store';
import { Card } from './Queues';
import styles from './Stream.module.css';

const pct = (s: number) => `${((s / BUFFER_VIEW_S) * 100).toFixed(2)}%`;

// Memoized per rung: on most ticks no cell of a row changes, so the row doesn't re-render.
const LadderRowView = memo(function LadderRowView({ rung, label, rate, states }: { rung: number; label: string; rate: string; states: string }) {
  return (
    <div className={`${styles.row} ${styles[`r${rung}`]}`}>
      <span className={styles.rowLabel}><b>{label}</b><span>{rate}</span></span>
      {states.split(',').map((s, seg) => (
        <span key={seg} className={`${styles.c} ${styles[s]}`} data-state={s} data-rung={rung} data-seg={seg} />
      ))}
    </div>
  );
});

const LEGEND = [
  { label: 'na origem', className: styles.origin },
  { label: 'em cache na borda', className: styles.edge },
  { label: 'em trânsito', className: styles.transit },
  { label: 'baixado por Kenji', className: styles.got },
  { label: 'abandonado', className: styles.abandoned },
];

/** A · the encoder's output: 4 rungs × 15 segments, and where each copy is (origin, CDN edge, in flight, at Kenji). */
export function Ladder({ active }: { active: boolean }) {
  const snap = useStreamSnapshot();
  const plan = useSim((s) => s.streamPlan);
  const rows = ladderRows(plan, snap);
  const got = rows.reduce((n, r) => n + r.cells.filter((c) => c === 'got').length, 0);
  return (
    <Card side="A" active={active} title="Escada de qualidade" desc={ladderDesc(plan, snap)}>
      <p className="sr-only">{got} de {plan.config.segBytes[0].length} segmentos já chegaram a Kenji.</p>
      <div className={styles.ladder} aria-hidden="true">
        {rows.map((r) => <LadderRowView key={r.rung} rung={r.rung} label={r.label} rate={r.rate} states={r.cells.join(',')} />)}
        <div className={styles.axis}><span /><span><span>0:00</span><span>segmentos de 2 s</span><span>0:30</span></span></div>
      </div>
      <ul className={styles.legend}>
        {LEGEND.map((l) => <li key={l.label}><span className={`${styles.swatch} ${l.className}`} aria-hidden="true" />{l.label}</li>)}
      </ul>
    </Card>
  );
}

/** B · seconds of video ahead of the playhead: block height = rung, the arriving segment dashed in the traffic colour. */
export function PlaybackBuffer({ active }: { active: boolean }) {
  const snap = useStreamSnapshot();
  const plan = useSim((s) => s.streamPlan);
  const stalled = snap.sample.stalled && snap.t < plan.end;
  const buffer = snap.sample.buffer.toFixed(1).replace('.', ',');
  return (
    <Card side="B" active={active} title="Buffer de reprodução" desc={bufferDesc(plan, snap)}>
      <div className={styles.track} role="img" aria-label={stalled ? 'Buffer vazio: o vídeo travou' : `Buffer com ${buffer} s à frente da reprodução`} data-stalled={stalled}>
        {bufferBlocks(plan, snap).map((b) => (
          <div key={`${b.seg}${b.arriving ? 'a' : ''}`} className={`${b.arriving ? styles.arriving : styles.block} ${styles[`h${b.rung}`]}`}
            style={{ left: pct(b.start), width: pct(b.width) }} data-rung={b.rung} title={`Segmento ${b.seg + 1} · ${b.label}`}>
            {b.width > 1.2 && !b.arriving ? b.label : null}
          </div>
        ))}
        <div className={styles.playhead} />
        {BUFFER_MARKS.map((m) => <div key={m.at} className={styles.mark} style={{ left: pct(m.at) }}><span>{m.label}</span></div>)}
      </div>
      <div className={styles.scale} aria-hidden="true">
        <span style={{ left: 0 }}>reprodução</span>
        {[6, 12, 18, 24, 30].map((s) => <span key={s} style={{ left: pct(s) }}>{s} s</span>)}
      </div>
      <p className={styles.note}>{bufferNote(plan, snap)}</p>
    </Card>
  );
}
