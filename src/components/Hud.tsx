import { focusAt } from '../lib/camera';
import { routeSummary, whereOnRoute } from '../lib/describe';
import { useSnapshot } from '../lib/useSim';
import { useSim } from '../store';
import styles from './Hud.module.css';

/** Live counters in the corner of the globe, so the numbers sit next to the motion they describe. */
export function Hud() {
  const snap = useSnapshot();
  const route = useSim((s) => s.route);
  const msPerTick = useSim((s) => s.msPerTick);
  const flying = snap.packets.filter((p) => p.state === 'transit' || p.state === 'resend').length;
  const lost = snap.events.filter((e) => e.kind === 'lost').length;

  return (
    <dl className={styles.hud} aria-label="Números do envio">
      <div><dt>Rota</dt><dd className={styles.small}>{routeSummary(route)} · ≈ {Math.round(100 * msPerTick)} ms</dd></div>
      <div><dt>Em voo</dt><dd>{flying}</dd></div>
      <div><dt>Recebidos</dt><dd>{snap.received.length}/{snap.packets.length}</dd></div>
      <div><dt>Perdidos</dt><dd className={lost ? styles.lost : undefined}>{lost}</dd></div>
      <div><dt>Cabo</dt><dd className={styles.small}>{whereOnRoute(route, focusAt(snap)).cable}</dd></div>
    </dl>
  );
}
