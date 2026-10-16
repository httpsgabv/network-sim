import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import type { Line2 } from 'three-stdlib';
import { cableById } from '../../data/network';
import { arc, segmentBuffer } from '../../lib/globe';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { toLatLon } from '../../sim/geo';
import type { Leg } from '../../sim/route';
import { useSim } from '../../store';

const legLine = (leg: Leg) => arc(leg.points.map(toLatLon), 1.003, 0.75);

/**
 * The route over the mesh: the whole cables it uses (~35%), the legs it actually travels
 * (sea solid ~70%, land dashed), and marching dots along all of it.
 */
export function Route() {
  const route = useSim((s) => s.route);
  const { cables, sea, land, all } = useMemo(() => {
    const used = [...new Set(route.legs.map((l) => l.cable))].filter((id) => cableById.has(id));
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(segmentBuffer(used.flatMap((id) => cableById.get(id)!.legs.map((l) => l.points)), 1.0025), 3));
    return {
      cables: g,
      sea: route.legs.filter((l) => cableById.has(l.cable)).map(legLine),
      land: route.legs.filter((l) => !cableById.has(l.cable)).map(legLine),
      all: arc(route.legs.flatMap((leg, i) => (i === 0 ? leg.points : leg.points.slice(1)).map(toLatLon)), 1.003, 0.75),
    };
  }, [route]);
  useEffect(() => () => cables.dispose(), [cables]);

  // a cable picked off the route (globe click or card) stands out from the mesh
  const selected = useSim((s) => s.selectedCable);
  const picked = useMemo(() => {
    if (!selected || route.legs.some((l) => l.cable === selected)) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(segmentBuffer(cableById.get(selected)?.legs.map((l) => l.points) ?? [], 1.0025), 3));
    return g;
  }, [selected, route]);
  useEffect(() => () => picked?.dispose(), [picked]);

  const marching = useRef<Line2>(null);
  const reduced = useReducedMotion();
  // "marching dots" along the active route: slow and constant, independent of playback
  useFrame((_, delta) => {
    if (marching.current && !reduced) marching.current.material.dashOffset -= delta * 0.04;
  });

  return (
    <>
      <lineSegments geometry={cables}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.35} depthWrite={false} />
      </lineSegments>
      {picked && (
        <lineSegments geometry={picked}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.6} depthWrite={false} />
        </lineSegments>
      )}
      {sea.map((points, i) => (
        <Line key={`s${i}`} points={points} color="#ffffff" lineWidth={1.4} transparent opacity={0.7} depthWrite={false} />
      ))}
      {land.map((points, i) => (
        <Line key={`l${i}`} points={points} color="#ffffff" lineWidth={1.2} transparent opacity={0.5} depthWrite={false} dashed dashSize={0.008} gapSize={0.008} />
      ))}
      {!reduced && (
        <Line ref={marching} points={all} color="#ffffff" lineWidth={1.8} transparent opacity={0.9} depthWrite={false} dashed dashSize={0.004} gapSize={0.03} />
      )}
    </>
  );
}
