import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { NETWORK_NODES, nodeById } from '../../data/network';
import { toXYZ } from '../../lib/globe';
import { useSim } from '../../store';

const R = 1.0035;
const LANDINGS = NETWORK_NODES.filter((n) => n.kind === 'landing');

function pointsOf(ids: string[]) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(ids.flatMap((id) => toXYZ(nodeById.get(id)!.at).map((c) => c * R))), 3));
  return g;
}

/** Landing stations: all of them as small `--land` dots, the route's own in white. */
export function Landings() {
  const all = useMemo(() => pointsOf(LANDINGS.map((n) => n.id)), []);
  const route = useSim((s) => s.route);
  const onRoute = useMemo(() => pointsOf(route.hops.filter((id) => nodeById.get(id)?.kind === 'landing')), [route]);
  useEffect(() => () => all.dispose(), [all]);
  useEffect(() => () => onRoute.dispose(), [onRoute]);

  return (
    <>
      <points geometry={all}>
        <pointsMaterial color="#71717a" size={2} sizeAttenuation={false} transparent opacity={0.8} depthWrite={false} />
      </points>
      <points geometry={onRoute}>
        <pointsMaterial color="#fafafa" size={4} sizeAttenuation={false} depthWrite={false} />
      </points>
    </>
  );
}
