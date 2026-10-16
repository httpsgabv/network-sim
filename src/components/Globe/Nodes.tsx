import { useFrame } from '@react-three/fiber';
import { useMemo, type RefObject } from 'react';
import { Vector3 } from 'three';
import { CITIES } from '../../data/nodes';
import { globeLabels, type GlobeLabel } from '../../lib/describe';
import { toVector } from '../../lib/globe';
import { streamGlobeLabels, streamRoutes } from '../../lib/streamGlobe';
import { useSim } from '../../store';

/** Ids on the current route (Streaming: both paths through the CDN edge); changes only with the route or mode. */
export function useOnRoute() {
  const route = useSim((s) => s.route);
  const stream = useSim((s) => s.mode === 'stream');
  return useMemo(() => {
    if (!stream) return new Set(route.hops);
    const r = streamRoutes(route.hops[0], route.hops.at(-1)!);
    return new Set([...r.toEdge.hops, ...r.toViewer.hops]);
  }, [route, stream]);
}

export type PlacedLabel = GlobeLabel & { position: Vector3 };

/** Cities, plus the route's landing stations and cable names; recomputed only when the route changes. */
export function useGlobeLabels(): PlacedLabel[] {
  const route = useSim((s) => s.route);
  const stream = useSim((s) => s.mode === 'stream');
  return useMemo(() => {
    const labels = stream ? streamGlobeLabels(streamRoutes(route.hops[0], route.hops.at(-1)!)) : globeLabels(route);
    return labels.map((l) => ({ ...l, position: toVector(l.at, 1.004) }));
  }, [route, stream]);
}

const CITY_MARKERS = CITIES.map((c) => ({ id: c.id, position: toVector(c.at, 1.004) }));
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
 * City markers live in the scene; labels are plain DOM in an overlay (see Globe.tsx) that this
 * component positions every frame. One React root instead of one per label (drei <Html>).
 */
export function Nodes({ labels, items }: { labels: RefObject<(HTMLDivElement | null)[]>; items: PlacedLabel[] }) {
  const onRoute = useOnRoute();
  useFrame(({ camera, size }) => {
    eye.copy(camera.position).normalize();
    items.forEach((n, i) => {
      const el = labels.current?.[i];
      if (!el) return;
      const facing = projected.copy(n.position).normalize().dot(eye);
      projected.copy(n.position).project(camera);
      const x = ((projected.x + 1) / 2) * size.width, y = ((1 - projected.y) / 2) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const dim = n.kind === 'city' && !onRoute.has(n.id) ? 0.75 : 1;
      const opacity = Math.max(0, Math.min(1, (facing - 0.3) * 5)) * dim;
      el.style.opacity = String(opacity);
      // behind the globe: not clickable or focusable either (cable names are buttons)
      el.style.visibility = opacity > 0.05 ? 'visible' : 'hidden';
    });
  });

  return (
    <>
      {CITY_MARKERS.map((n) => (
        <Marker key={n.id} position={n.position} active={onRoute.has(n.id)} />
      ))}
    </>
  );
}
