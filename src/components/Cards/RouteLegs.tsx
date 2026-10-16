import { actorAt } from '../../lib/actors';
import { focusAt } from '../../lib/camera';
import { endpointNames, legRows, routeSummary, seaShare } from '../../lib/describe';
import { useSnapshot } from '../../lib/useSim';
import { FIBRE_MS_PER_KM, routeKm } from '../../sim/route';
import { useSim } from '../../store';
import cards from './Cards.module.css';
import styles from './RouteLegs.module.css';

const km = (x: number) => Math.round(x).toLocaleString('pt-BR');
const ms = (x: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Rota panel: each hop of the route, which real cable carries it, and how long light takes there. */
export function RouteLegs() {
  const route = useSim((s) => s.route);
  const selectCable = useSim((s) => s.selectCable);
  const snap = useSnapshot();
  const { origin, destination } = endpointNames(route);
  const rows = legRows(route);
  // the leg the camera follows, only while the packets (or the SACK) are on the network
  const active = actorAt(snap.t).key === 'N' ? route.posAt(focusAt(snap)).leg : -1;

  return (
    <section aria-label="Rota" className={cards.embedded}>
      <div className={styles.head}>
        <h2 className={styles.title}>{origin} → {destination}</h2>
        <span className={styles.summary}>{routeSummary(route)} · ≈{Math.round(routeKm(route) * FIBRE_MS_PER_KM)} ms</span>
      </div>
      <ol className={styles.list} aria-label="Trechos da rota">
        {rows.map((r, i) => (
          <li key={i} className={styles.leg} data-active={i === active} aria-current={i === active ? 'step' : undefined}>
            <span className={styles.n}>{String(r.n).padStart(2, '0')}</span>
            <div className={styles.what}>
              <span className={styles.between}>{r.between}</span>
              {r.sea ? (
                <button type="button" className={styles.cable} onClick={() => selectCable(r.cable)} aria-label={`Ficha do cabo ${r.cableName}`}>
                  {r.cableName} ›
                </button>
              ) : (
                <span className={styles.land}>{r.cableName} · por terra</span>
              )}
            </div>
            <span className={styles.nums}>{km(r.km)} km<br />{ms(r.ms)} ms</span>
          </li>
        ))}
      </ol>
      <p className={styles.note}>
        {Math.round(seaShare(route) * 100)}% do caminho é fibra no fundo do mar. Trechos por terra contam a distância × 1,3: a fibra acompanha estradas e ferrovias.
      </p>
    </section>
  );
}
