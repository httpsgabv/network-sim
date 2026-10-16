import { DONE_HINT, DONE_LABEL, STAGE_HINT, STAGE_LABEL, STREAM_STAGE_LABEL } from '../copy';
import { actorAt, streamActor } from '../lib/actors';
import { streamHint } from '../lib/describe';
import { streamRoutes } from '../lib/streamGlobe';
import { useSnapshot, useStreamSnapshot } from '../lib/useSim';
import { STAGES } from '../sim/engine';
import { STREAM_STAGES } from '../sim/stream/types';
import { useSim } from '../store';
import styles from './StageHeader.module.css';

export function StageHeader() {
  const stream = useSim((s) => s.mode === 'stream');
  return stream ? <StreamStageHeader /> : <TransferStageHeader />;
}

function StreamStageHeader() {
  const snap = useStreamSnapshot();
  const plan = useSim((s) => s.streamPlan);
  const origin = useSim((s) => s.origin);
  const destination = useSim((s) => s.destination);
  const actor = streamActor(snap.stage);
  const done = STREAM_STAGES[snap.stage] === 'end';
  return (
    <div className={styles.header} aria-live="polite">
      <span className={`${styles.actor} ${styles[`actor${actor.key}`]}`}>{actor.label}</span>
      <div className={styles.badge}>
        <span className={`${styles.dot} ${done ? styles.done : ''}`} />
        Etapa {String(snap.stage + 1).padStart(2, '0')} / {String(STREAM_STAGES.length).padStart(2, '0')}
      </div>
      <h1 className={styles.title}>{STREAM_STAGE_LABEL[STREAM_STAGES[snap.stage]]}</h1>
      <p className={styles.hint}>{streamHint(plan, snap, origin, streamRoutes(origin, destination).edge)}</p>
    </div>
  );
}

function TransferStageHeader() {
  const { stage, t } = useSnapshot();
  const actor = actorAt(t);
  const done = stage >= STAGES.length;
  const key = STAGES[Math.min(stage, STAGES.length - 1)];
  const tone = done ? styles.done : key === 'sack' || key === 'resend' ? styles.recovery : '';

  return (
    <div className={styles.header} aria-live="polite">
      <span className={`${styles.actor} ${styles[`actor${actor.key}`]}`}>{actor.label}</span>
      <div className={styles.badge}>
        <span className={`${styles.dot} ${tone}`} />
        Etapa {String(Math.min(stage + 1, STAGES.length)).padStart(2, '0')} / {String(STAGES.length).padStart(2, '0')}
      </div>
      <h1 className={styles.title}>{done ? DONE_LABEL : STAGE_LABEL[key]}</h1>
      <p className={styles.hint}>{done ? DONE_HINT : STAGE_HINT[key]}</p>
    </div>
  );
}
