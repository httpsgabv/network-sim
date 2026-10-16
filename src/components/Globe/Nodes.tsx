import { useFrame } from '@react-three/fiber';
import { useMemo, type RefObject } from 'react';
import { Vector3 } from 'three';
import { NODES } from '../../data/nodes';
import { toVector } from '../../lib/globe';
import { useSim } from '../../store';

/** Ids on the current route; the set only changes when the route does. */
export function useOnRoute() {
  const route = useSim((s) => s.route);
  return useMemo(() => new Set(route.hops), [route]);
}

/** Nodes that get a marker and a label (landing stations are routing-only). */
export const LABELED = NODES.filter((n) => n.kind !== 'landing').map((n) => ({
  ...n,
  position: toVector(n.at, 1.004),
}));

const eye = new Vector3(), projected = new Vector3();

function Marker({ position, active }: { position: Vector3; active: boolean }) {
  const look = useMemo(() => position.clone().multiplyScalar(2), [position]);
  return (
    <group position={position} onUpdate={(g) => g.lookAt(look)}>
      {active ? (
        <>
          <mesh><circleGeometry args={[0.011, 24]} /><meshBasicMaterial color="#000000" /></mesh>
          <mesh><ringGeometry args={[0.011, 0.016, 32]} /><meshBasicMaterial color="#fafafa" /></mesh>
        </>
      ) : (
        <mesh><circleGeometry args={[0.006, 16]} /><meshBasicMaterial color="#a1a1aa" /></mesh>
      )}
    </group>
  );
}

/**
 * Markers live in the scene; labels are plain DOM in an overlay (see Globe.tsx) that this
 * component positions every frame. One React root instead of one per label (drei <Html>).
 */
export function Nodes({ labels }: { labels: RefObject<(HTMLDivElement | null)[]> }) {
  const onRoute = useOnRoute();
  useFrame(({ camera, size }) => {
    eye.copy(camera.position).normalize();
    LABELED.forEach((n, i) => {
      const el = labels.current?.[i];
      if (!el) return;
      const facing = projected.copy(n.position).normalize().dot(eye);
      projected.copy(n.position).project(camera);
      const x = ((projected.x + 1) / 2) * size.width, y = ((1 - projected.y) / 2) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.opacity = String(Math.max(0, Math.min(1, (facing - 0.3) * 5)) * (onRoute.has(n.id) ? 1 : 0.75));
    });
  });

  return (
    <>
      {LABELED.map((n) => (
        <Marker key={n.id} position={n.position} active={onRoute.has(n.id)} />
      ))}
    </>
  );
}
