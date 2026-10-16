import { cableById, nodeName } from '../../data/network';
import { FIBRE_MS_PER_KM } from '../../sim/route';
import { useSim } from '../../store';
import cards from './Cards.module.css';
import styles from './CableCard.module.css';

const km = (x: number) => Math.round(x).toLocaleString('pt-BR');

/** A real cable's card, opened from the Rota list or by clicking the cable on the globe. */
export function CableCard({ id }: { id: string }) {
  const route = useSim((s) => s.route);
  const selectCable = useSim((s) => s.selectCable);
  const c = cableById.get(id);
  if (!c) return null;

  const onRoute = route.legs.some((l) => l.cable === id);
  const hops = new Set(route.hops);
  // the official length when the data has it, else what we drew
  const length = c.lengthKm ?? c.legs.reduce((s, l) => s + l.km, 0);
  const rows = [
    ['Em operação desde', c.rfs ? String(c.rfs) : '—'],
    ['Comprimento', `${km(length)} km`],
    ['Estações de pouso', String(c.landings.length)],
    ['Luz de ponta a ponta', `≈${km(length * FIBRE_MS_PER_KM)} ms`],
  ];

  return (
    <section aria-label={`Ficha do cabo ${c.name}`} className={cards.embedded}>
      <button type="button" className={styles.back} onClick={() => selectCable(null)}>← Trechos</button>
      <div className={styles.head}>
        <h2 className={styles.name}>{c.name}</h2>
        <span className={styles.chips}>
          {c.planned && <span className={`${styles.chip} ${styles.dashed}`}>Planejado em 2022</span>}
          <span className={`${styles.chip} ${onRoute ? '' : styles.dashed}`}>{onRoute ? 'Na rota' : 'Fora da rota'}</span>
        </span>
      </div>
      <dl className={styles.rows}>
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {c.owners && (
        <div>
          <h3 className={styles.label}>Proprietários</h3>
          <p className={styles.owners}>{c.owners}</p>
        </div>
      )}
      <div>
        <h3 className={styles.label}>Estações de pouso</h3>
        <ul className={styles.stations}>
          {c.landings.map((l) => (
            <li key={l} data-on-route={hops.has(l)}>{nodeName(l)}</li>
          ))}
        </ul>
      </div>
      <p className={styles.source}>Fonte: TeleGeography (dados de 2022) · CC BY-NC-SA 3.0</p>
    </section>
  );
}
