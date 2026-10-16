import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { CABLES } from '../../data/cables';
import { nodeById } from '../../data/nodes';
import { arc } from '../../lib/globe';
import type { LatLon } from '../../sim/types';

export function Cables() {
  const lines = useMemo(
    () =>
      CABLES.map((c) => ({
        id: c.id,
        points: arc(c.path.map((p): LatLon => (typeof p === 'string' ? nodeById.get(p)!.at : p)), 1.002),
        dashed: c.kind === 'terrestrial',
      })),
    [],
  );

  return (
    <>
      {lines.map((l) => (
        <Line
          key={l.id}
          points={l.points}
          color="#ffffff"
          lineWidth={0.8}
          transparent
          opacity={l.dashed ? 0.08 : 0.12}
          depthWrite={false}
          dashed={l.dashed}
          dashSize={0.01}
          gapSize={0.01}
        />
      ))}
    </>
  );
}
