import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, type RefObject } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { focusAt } from '../../lib/camera';
import { streamFocus, streamRoutes } from '../../lib/streamGlobe';
import { toXYZ } from '../../lib/globe';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { slerp, type Vec3 } from '../../sim/geo';
import { snapshotOf, streamSnapshotOf } from '../../lib/useSim';
import type { LatLon } from '../../sim/types';
import { useSim } from '../../store';

/** After the user drags the globe, leave the camera alone for this long. */
const USER_HOLD_MS = 4000;
/** Reduced motion: no continuous pan, the camera cuts to the action at most this often. */
const CUT_EVERY_S = 2.5;

export function CameraRig({ controls }: { controls: RefObject<OrbitControlsImpl | null> }) {
  const reduced = useReducedMotion();
  const holdUntil = useRef(0);
  const lastCut = useRef(-Infinity);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const start = () => { holdUntil.current = Infinity; };
    const end = () => { holdUntil.current = performance.now() + USER_HOLD_MS; };
    c.addEventListener('start', start);
    c.addEventListener('end', end);
    return () => { c.removeEventListener('start', start); c.removeEventListener('end', end); };
  }, [controls]);

  useFrame(({ camera, clock }, delta) => {
    if (performance.now() < holdUntil.current) return;
    if (reduced && clock.elapsedTime - lastCut.current < CUT_EVERY_S) return;
    lastCut.current = clock.elapsedTime;

    const s = useSim.getState();
    let at: LatLon;
    if (s.mode === 'stream') {
      const f = streamFocus(streamSnapshotOf(s.streamPlan, s.t));
      at = streamRoutes(s.origin, s.destination)[f.path].posAt(f.s).at;
    } else at = s.route.posAt(focusAt(snapshotOf(s.plan, s.t))).at;
    // look slightly towards the equator so both hemispheres of the route stay in frame
    const lat = Math.max(-15, Math.min(25, at[0] * 0.6));
    const lon = at[1] + (reduced ? 0 : Math.sin(clock.elapsedTime * 0.08) * 6);

    const dist = camera.position.length();
    const from = camera.position.clone().normalize().toArray() as Vec3;
    const to = toXYZ([lat, lon]);
    // slerp is undefined between antipodes; nudge the target off the exact opposite point
    if (from[0] * to[0] + from[1] * to[1] + from[2] * to[2] < -0.999) to[1] += 0.05;
    // great-circle easing keeps the camera outside the globe even on 180° swings
    const k = reduced ? 1 : 1 - Math.exp(-delta * 2.2);
    camera.position.fromArray(slerp(from, to, k)).multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
  });

  return null;
}
