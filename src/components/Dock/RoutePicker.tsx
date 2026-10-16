import { CITIES } from '../../data/nodes';
import { refreshDemoText } from '../../lib/payload';
import { useSim } from '../../store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import styles from './RoutePicker.module.css';

const nameOf = (id: string) => CITIES.find((c) => c.id === id)?.name ?? id;

/** Origin → destination in the top bar. Like the other scenario controls, changing it restarts the send. */
export function RoutePicker() {
  const origin = useSim((s) => s.origin);
  const destination = useSim((s) => s.destination);

  // the demo text names the origin city, so it must follow the route
  const apply = (change: () => void) => {
    const before = nameOf(useSim.getState().origin);
    change();
    void refreshDemoText(before);
  };
  const { setRoute, swapRoute } = useSim.getState();

  const picker = (side: 'A' | 'B', value: string, label: string, onChange: (id: string) => void) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <span className={side === 'A' ? styles.chipA : styles.chipB} aria-hidden="true">{side}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CITIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className={styles.picker} role="group" aria-label="Rota">
      {picker('A', origin, 'Origem', (id) => apply(() => setRoute(id, destination)))}
      <button type="button" className={styles.swap} aria-label="Inverter origem e destino" onClick={() => apply(swapRoute)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {picker('B', destination, 'Destino', (id) => apply(() => setRoute(origin, id)))}
    </div>
  );
}
