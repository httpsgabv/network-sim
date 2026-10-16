import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { CABLE_DATA } from '../../data/cableData';
import { cableMesh, nearestCable } from '../../lib/globe';
import { useSim } from '../../store';

const R = 1.002;
/** How far from a cable a click still picks it: ~3 px at the default camera distance. */
const PICK = 0.012;
/** A press that moved more than this (px) was a drag to rotate the globe, not a click. */
const DRAG_PX = 4;

/** Every submarine cable in the dataset, faint: the infrastructure around the route. One draw call. */
export function Cables() {
  const mesh = useMemo(() => cableMesh(CABLE_DATA.cables.map((c) => ({ id: c.id, lines: c.legs.map((l) => l.points) })), R), []);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    return g;
  }, [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const selectCable = useSim((s) => s.selectCable);

  // Clicks land on an invisible shell over the globe (cheap to raycast, and it hides the far side);
  // the nearest drawn cable to that point is the one picked.
  // ponytail: no hover cursor, that would scan every segment on each pointer move; add a spatial index if wanted.
  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > DRAG_PX) return;
    const id = nearestCable(mesh, e.point.toArray(), PICK);
    if (id) { e.stopPropagation(); selectCable(id); }
  };

  return (
    <>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.09} depthWrite={false} />
      </lineSegments>
      <mesh onClick={pick}>
        <sphereGeometry args={[R, 48, 48]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </>
  );
}
