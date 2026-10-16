import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Line2 } from 'three-stdlib';
import { toLatLon } from '../../sim/geo';
import { arc } from '../../lib/globe';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { ROUTE } from '../../store';

export function Route() {
  const points = useMemo(
    () => arc(ROUTE.legs.flatMap((leg, i) => (i === 0 ? leg.points : leg.points.slice(1)).map(toLatLon)), 1.003, 0.75),
    [],
  );
  const marching = useRef<Line2>(null);
  const reduced = useReducedMotion();

  // "marching dots" along the active route: slow and constant, independent of playback
  useFrame((_, delta) => {
    if (marching.current && !reduced) marching.current.material.dashOffset -= delta * 0.04;
  });

  return (
    <>
      <Line points={points} color="#ffffff" lineWidth={1.4} transparent opacity={0.22} depthWrite={false} />
      <Line
        ref={marching}
        points={points}
        color="#ffffff"
        lineWidth={1.6}
        transparent
        opacity={0.7}
        depthWrite={false}
        dashed
        dashSize={0.004}
        gapSize={0.03}
      />
    </>
  );
}
