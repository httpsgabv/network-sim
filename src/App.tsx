import { lazy, Suspense, useEffect } from 'react';
import styles from './App.module.css';
import { Details } from './components/Cards/Details';
import { ReceiverPhone } from './components/Chat/ReceiverPhone';
import { SenderPhone } from './components/Chat/SenderPhone';
import { Dock, NetworkControls } from './components/Dock/Dock';
import { Hud } from './components/Hud';
import { Segmented } from './components/Segmented';
import { StageHeader } from './components/StageHeader';
import { actorAt } from './lib/actors';
import { sendDemo } from './lib/payload';
import { useClock } from './lib/useSim';
import { KINDS, useSim, type Kind } from './store';

// three.js is most of the bundle; load it after the shell paints.
const Globe = lazy(() => import('./components/Globe/Globe'));

const KIND_OPTIONS = (Object.keys(KINDS) as Kind[]).map((k) => ({ value: k, label: KINDS[k].label }));

/**
 * Two layouts from the same tree (CSS only, see App.module.css):
 * - cockpit (viewport ≥ 1100×640): everything in one screen, panels scroll inside themselves;
 * - stacked (smaller screens): the page scrolls, globe first.
 */
export default function App() {
  useClock();
  const kind = useSim((s) => s.kind);
  // re-renders only when the acting side changes, not on every tick
  const networkActive = useSim((s) => actorAt(s.t).key === 'N');

  useEffect(() => { void sendDemo('photo'); }, []);

  return (
    <div className={styles.app}>
      <header className={styles.nav}>
        <div className={styles.brand}>
          <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true">
            <circle cx="11" cy="11" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <ellipse cx="11" cy="11" rx="4" ry="9.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="17.5" cy="6" r="2" fill="currentColor" />
          </svg>
          Network Simulator
          <span className={styles.badge}>beta</span>
        </div>
        <div className={styles.scenario}>
          <Segmented label="Tipo de conteúdo" options={KIND_OPTIONS} value={kind} onChange={(k) => void sendDemo(k)} />
          <NetworkControls />
        </div>
        <div className={styles.route}>GRU → NRT · 18.540 km</div>
      </header>
      <main className={styles.workspace}>
        <div className={styles.stageRow}>
          <SenderPhone />
          <section className={styles.stage} aria-label="Simulação · rede" data-active={networkActive}>
            <div className={styles.title}><StageHeader /></div>
            <div className={styles.hud}><Hud /></div>
            <div className={styles.globe}>
              <Suspense fallback={<div className={styles.placeholder}>Carregando globo…</div>}>
                <Globe />
              </Suspense>
            </div>
            <Dock />
          </section>
          <ReceiverPhone />
        </div>
        <Details className={styles.details} />
      </main>
    </div>
  );
}
