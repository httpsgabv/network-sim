import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Line2 } from 'three-stdlib';
import { nodeById } from '../../data/network';
import { arc, toVector, TRANSIT } from '../../lib/globe';
import { streamFocus, streamRoutes } from '../../lib/streamGlobe';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { streamSnapshotOf } from '../../lib/useSim';
import { toLatLon } from '../../sim/geo';
import type { Route } from '../../sim/route';
import { useSim } from '../../store';

const line = (route: Route) => arc(route.legs.flatMap((leg, i) => (i === 0 ? leg.points : leg.points.slice(1)).map(toLatLon)), 1.003, 0.75);

/** The CDN edge is a square (shape, not colour, tells it apart from the round city markers). */
function EdgeMarker({ id }: { id: string }) {
  const position = useMemo(() => toVector(nodeById.get(id)!.at, 1.004), [id]);
  const look = useMemo(() => position.clone().multiplyScalar(2), [position]);
  return (
    <group position={position} onUpdate={(g) => g.lookAt(look)}>
      <mesh rotation={[0, 0, Math.PI / 4]}><circleGeometry args={[0.014, 4]} /><meshBasicMaterial color="#000000" /></mesh>
      <mesh rotation={[0, 0, Math.PI / 4]}><ringGeometry args={[0.014, 0.02, 4]} /><meshBasicMaterial color="#fafafa" /></mesh>
    </group>
  );
}

/**
 * Streaming paths: origin → edge dashed white (lit magenta while a miss or the manifest travels it),
 * edge → viewer in the traffic colour, with marching dots while a segment downloads.
 */
export function StreamRoute() {
  const origin = useSim((s) => s.origin);
  const destination = useSim((s) => s.destination);
  const routes = streamRoutes(origin, destination);
  const toEdge = useMemo(() => line(routes.toEdge), [routes]);
  const toViewer = useMemo(() => line(routes.toViewer), [routes]);
  const missLit = useRef<Line2>(null);
  const marching = useRef<Line2>(null);
  const reduced = useReducedMotion();

  useFrame((_, delta) => {
    const { t, streamPlan } = useSim.getState();
    const snap = streamSnapshotOf(streamPlan, t);
    if (missLit.current) missLit.current.material.opacity = snap.stage > 0 && streamFocus(snap).path === 'toEdge' ? 0.8 : 0;
    if (marching.current) {
      marching.current.material.opacity = snap.download?.phase === 'transfer' ? 1 : 0;
      marching.current.material.dashOffset -= delta * 0.04;
    }
  });

  return (
    <>
      <Line points={toEdge} color="#ffffff" lineWidth={1.4} transparent opacity={0.4} depthWrite={false} dashed dashSize={0.01} gapSize={0.01} />
      <Line ref={missLit} points={toEdge} color={TRANSIT} lineWidth={2.4} transparent opacity={0} depthWrite={false} />
      <Line points={toViewer} color={TRANSIT} lineWidth={2.4} transparent opacity={0.8} depthWrite={false} />
      {!reduced && (
        <Line ref={marching} points={toViewer} color={TRANSIT} lineWidth={3} transparent opacity={0} depthWrite={false} dashed dashSize={0.004} gapSize={0.03} />
      )}
      <EdgeMarker id={routes.edge} />
    </>
  );
}
