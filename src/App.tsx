import { lazy, Suspense, useEffect } from 'react';
import styles from './App.module.css';
import { Details } from './components/Cards/Details';
import { ReceiverPhone } from './components/Chat/ReceiverPhone';
import { SenderPhone } from './components/Chat/SenderPhone';
import { Dock } from './components/Dock/Dock';
import { RoutePicker } from './components/Dock/RoutePicker';
import { ModeSwitch, ScenarioControls } from './components/Dock/StreamControls';
import { DataCredit } from './components/DataCredit';
import { Hud } from './components/Hud';
import { StageHeader } from './components/StageHeader';
import { actorKeyOf } from './lib/actors';
import { routeSummary } from './lib/describe';
import { sendDemo } from './lib/payload';
import { useClock } from './lib/useSim';
import { useSim } from './store';

// three.js is most of the bundle; load it after the shell paints.
const Globe = lazy(() => import('./components/Globe/Globe'));

/**
 * Two layouts from the same tree (CSS only, see App.module.css):
 * - cockpit (viewport ≥ 1100×640): everything in one screen, panels scroll inside themselves;
 * - stacked (smaller screens): the page scrolls, globe first.
 */
export default function App() {
  useClock();
  const summary = useSim((s) => routeSummary(s.route));
  // re-renders only when the acting side changes, not on every tick
  const networkActive = useSim((s) => actorKeyOf(s) === 'N');

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
          <span className={styles.brandName}>Network Simulator</span>
          <span className={`${styles.badge} ${styles.brandName}`}>beta</span>
          <ModeSwitch />
        </div>
        <div className={styles.scenario}>
          <ScenarioControls />
        </div>
        <div className={styles.route}>
          <RoutePicker />
          <span className={styles.summary}>{summary}</span>
        </div>
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
            <DataCredit />
          </section>
          <ReceiverPhone />
        </div>
        <Details className={styles.details} />
      </main>
    </div>
  );
}
