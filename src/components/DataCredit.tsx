import { CABLE_DATA } from '../data/cableData';
import styles from './DataCredit.module.css';

/** Attribution required by the cable data's license (CC BY-NC-SA 3.0). Always on screen. */
export function DataCredit() {
  return (
    <p className={styles.credit}>
      Dados de cabos: <a href="https://www.submarinecablemap.com" target="_blank" rel="noreferrer">TeleGeography</a> ({CABLE_DATA.snapshot.slice(0, 4)})
      {' · '}
      <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noreferrer" title={CABLE_DATA.license}>CC BY-NC-SA</a>
    </p>
  );
}
