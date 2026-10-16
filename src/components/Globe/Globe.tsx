import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useRef, useState } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { nodeById } from '../../data/network';
import { ZOOM_MAX, ZOOM_MIN } from '../../lib/camera';
import { toVector } from '../../lib/globe';
import { COCKPIT_QUERY, useMediaQuery } from '../../lib/useReducedMotion';
import { endpointNames } from '../../lib/describe';
import { streamRoutes } from '../../lib/streamGlobe';
import { nodeName } from '../../data/network';
import { useSim } from '../../store';
import { Cables } from './Cables';
import { CameraRig } from './CameraRig';
import styles from './Globe.module.css';
import { Land } from './Land';
import { Landings } from './Landings';
import { Nodes, useGlobeLabels, useOnRoute, type PlacedLabel } from './Nodes';
import { Route } from './Route';
import { Sphere } from './Sphere';
import { StreamRoute } from './StreamRoute';
import { StreamTraffic } from './StreamTraffic';
import { Traffic } from './Traffic';
import { ZoomControls } from './ZoomControls';

// Opening view over the origin; the CameraRig takes over from there.
const startAt = (origin: string) => {
  const [lat, lon] = nodeById.get(origin)!.at;
  return toVector([Math.max(-15, Math.min(25, lat * 0.6)), lon], 4.2).toArray();
};

// City and landing names sit right of their dot; cable names are centred on the cable, outlined.
const labelClass = (n: PlacedLabel, onRoute: boolean) =>
  n.kind === 'cable' ? styles.cableLabel
    : n.kind === 'landing' ? `${styles.label} ${styles.labelLanding}`
      : onRoute ? styles.label : `${styles.label} ${styles.labelDim}`;

export default function Globe() {
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const controls = useRef<OrbitControlsImpl>(null);
  const onRoute = useOnRoute();
  const items = useGlobeLabels();
  const selectCable = useSim((s) => s.selectCable);
  const cockpit = useMediaQuery(COCKPIT_QUERY);
  const route = useSim((s) => s.route);
  const { origin, destination } = endpointNames(route);
  const stream = useSim((s) => s.mode === 'stream');
  const label = stream
    ? `Globo 3D com o vídeo saindo de ${origin}, passando pela CDN em ${nodeName(streamRoutes(route.hops[0], route.hops.at(-1)!).edge)} e chegando a ${destination}`
    : `Globo 3D com cabos submarinos e a rota de ${origin} a ${destination}`;
  // only the first view: later route changes are the CameraRig's job
  const [cameraStart] = useState(() => startAt(useSim.getState().origin));

  return (
    // a group, not an img: the cable names on the globe are real buttons and must stay reachable
    <div className={styles.stage} role="group" aria-label={label}>
      <Canvas flat dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ fov: 35, position: cameraStart, near: 0.1, far: 50 }}>
        {/* first: useFrame runs in mount order, and labels must project with this frame's camera */}
        <CameraRig controls={controls} />
        <Sphere />
        <Land />
        <Cables />
        {stream ? <StreamRoute /> : <Route />}
        <Landings />
        <Nodes labels={labels} items={items} />
        {stream ? <StreamTraffic /> : <Traffic />}
        {/* wheel zoom only in the cockpit: in the stacked layout the wheel must keep scrolling the page */}
        <OrbitControls
          ref={controls}
          enablePan={false}
          enableZoom={cockpit}
          minDistance={ZOOM_MIN}
          maxDistance={ZOOM_MAX}
          zoomSpeed={0.6}
          enableDamping
          rotateSpeed={0.5}
        />
      </Canvas>
      {/* place names are decoration (the phones and the Rota panel say them); cable names open the cable's card */}
      <div className={styles.labels} aria-hidden="true">
        {items.map((n, i) => n.kind !== 'cable' && (
          <div key={n.key} ref={(el) => { labels.current[i] = el; }} className={styles.anchor} data-kind={n.kind}>
            <span className={labelClass(n, onRoute.has(n.id))}>{n.text}</span>
          </div>
        ))}
      </div>
      <div className={styles.labels}>
        {items.map((n, i) => n.kind === 'cable' && (
          <div key={n.key} ref={(el) => { labels.current[i] = el; }} className={styles.anchor} data-kind={n.kind}>
            <button type="button" className={styles.cableLabel} onClick={() => selectCable(n.id)} aria-label={`Ficha do cabo ${n.text}`}>
              {n.text}
            </button>
          </div>
        ))}
      </div>
      <ZoomControls controls={controls} />
    </div>
  );
}
