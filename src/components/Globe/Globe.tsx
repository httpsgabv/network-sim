import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { toVector } from '../../lib/globe';
import { Cables } from './Cables';
import { CameraRig } from './CameraRig';
import styles from './Globe.module.css';
import { Land } from './Land';
import { LABELED, Nodes } from './Nodes';
import { Route } from './Route';
import { Sphere } from './Sphere';
import { Traffic } from './Traffic';

// Opening view over São Paulo; the CameraRig takes over from there.
const CAMERA_START = toVector([-14, -46], 4.2).toArray();

export default function Globe() {
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const controls = useRef<OrbitControlsImpl>(null);

  return (
    <div className={styles.stage} role="img" aria-label="Globo 3D com cabos submarinos e a rota de São Paulo a Tóquio">
      <Canvas flat dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ fov: 35, position: CAMERA_START, near: 0.1, far: 50 }}>
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
            <span className={n.active ? styles.label : `${styles.label} ${styles.labelDim}`}>{n.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
