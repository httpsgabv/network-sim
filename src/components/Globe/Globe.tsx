import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useRef, useState } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { nodeById } from '../../data/nodes';
import { toVector } from '../../lib/globe';
import { endpointNames } from '../../lib/describe';
import { useSim } from '../../store';
import { Cables } from './Cables';
import { CameraRig } from './CameraRig';
import styles from './Globe.module.css';
import { Land } from './Land';
import { LABELED, Nodes, useOnRoute } from './Nodes';
import { Route } from './Route';
import { Sphere } from './Sphere';
import { Traffic } from './Traffic';

// Opening view over the origin; the CameraRig takes over from there.
const startAt = (origin: string) => {
  const [lat, lon] = nodeById.get(origin)!.at;
  return toVector([Math.max(-15, Math.min(25, lat * 0.6)), lon], 4.2).toArray();
};

export default function Globe() {
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const controls = useRef<OrbitControlsImpl>(null);
  const onRoute = useOnRoute();
  const route = useSim((s) => s.route);
  const { origin, destination } = endpointNames(route);
  // only the first view: later route changes are the CameraRig's job
  const [cameraStart] = useState(() => startAt(useSim.getState().origin));

  return (
    <div className={styles.stage} role="img" aria-label={`Globo 3D com cabos submarinos e a rota de ${origin} a ${destination}`}>
      <Canvas flat dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ fov: 35, position: cameraStart, near: 0.1, far: 50 }}>
        {/* first: useFrame runs in mount order, and labels must project with this frame's camera */}
        <CameraRig controls={controls} />
        <Sphere />
        <Land />
        <Cables />
        <Route />
        <Nodes labels={labels} />
        <Traffic />
        {/* no wheel zoom: the globe fills most of the viewport and must not trap page scrolling */}
        <OrbitControls ref={controls} enablePan={false} enableZoom={false} enableDamping rotateSpeed={0.5} />
      </Canvas>
      <div className={styles.labels} aria-hidden="true">
        {LABELED.map((n, i) => (
          <div key={n.id} ref={(el) => { labels.current[i] = el; }} className={styles.anchor}>
            <span className={onRoute.has(n.id) ? styles.label : `${styles.label} ${styles.labelDim}`}>{n.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
