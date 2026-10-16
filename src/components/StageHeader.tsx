import { DONE_HINT, DONE_LABEL, STAGE_HINT, STAGE_LABEL } from '../copy';
import { actorAt } from '../lib/actors';
import { useSnapshot } from '../lib/useSim';
import { STAGES } from '../sim/engine';
import styles from './StageHeader.module.css';

export function StageHeader() {
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
