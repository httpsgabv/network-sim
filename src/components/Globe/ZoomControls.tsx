import type { RefObject } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { zoomed, ZOOM_STEP } from '../../lib/camera';
import styles from './Globe.module.css';

/** +/− work in every layout (the wheel only zooms in the cockpit, where the page can't scroll). */
export function ZoomControls({ controls }: { controls: RefObject<OrbitControlsImpl | null> }) {
  const zoom = (factor: number) => {
    const c = controls.current;
    if (!c) return;
    const cam = c.object;
    cam.position.setLength(zoomed(cam.position.length(), factor));
    c.update();
  };

  return (
    <div className={styles.zoom} role="group" aria-label="Zoom do globo">
      <button type="button" className={styles.zoomButton} onClick={() => zoom(1 / ZOOM_STEP)} aria-label="Aproximar">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <button type="button" className={styles.zoomButton} onClick={() => zoom(ZOOM_STEP)} aria-label="Afastar">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}
