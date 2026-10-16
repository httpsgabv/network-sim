import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, type ShaderMaterial } from 'three';
import { nodeById } from '../../data/network';
import { toXYZ, TRANSIT } from '../../lib/globe';
import { burstMarks, streamPulse, streamRoutes, type StreamPath, type StreamRoutes } from '../../lib/streamGlobe';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { streamSnapshotOf } from '../../lib/useSim';
import { useSim } from '../../store';
import { KIND_DOT, KIND_LOSS, KIND_RING, SPRITE_FRAGMENT, SPRITE_VERTEX } from './Traffic';

// Bursts are ≤ 10 dots, plus loss marks and two pulse rings: one small buffer, one draw call.
const MAX_SPRITES = 32;
const TRAIL_SEGMENTS = 6;
const MAX_TRAIL_VERTS = 12 * TRAIL_SEGMENTS * 2;
const SURFACE = 1.004;
const TRAIL_LEN = 0.04;

const rgb = (hex: string) => new Color(hex).toArray() as [number, number, number];
const WHITE = rgb('#ffffff'), AMBER = rgb('#f5a524'), RED = rgb('#ef4444'), MAGENTA = rgb(TRANSIT);

function place(r: StreamRoutes, path: StreamPath, s: number, out: Float32Array, i: number) {
  const [x, y, z] = toXYZ(r[path].posAt(s).at);
  out[i] = x * SURFACE; out[i + 1] = y * SURFACE; out[i + 2] = z * SURFACE;
}

/** Streaming traffic on the globe: segment bursts (magenta), losses (red ×) and resends (amber), pulses at the ends. */
export function StreamTraffic() {
  const reduced = useReducedMotion();
  const material = useRef<ShaderMaterial>(null);

  const sprites = useMemo(() => {
    const g = new BufferGeometry();
    const attr = (name: string, size: number) =>
      g.setAttribute(name, new BufferAttribute(new Float32Array(MAX_SPRITES * size), size).setUsage(DynamicDrawUsage));
    attr('position', 3); attr('aColor', 4); attr('aSize', 1); attr('aKind', 1); attr('aPhase', 1);
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const trails = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(MAX_TRAIL_VERTS * 3), 3).setUsage(DynamicDrawUsage));
    g.setAttribute('color', new BufferAttribute(new Float32Array(MAX_TRAIL_VERTS * 4), 4).setUsage(DynamicDrawUsage));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  useFrame(({ camera, size, viewport, clock }) => {
    const { t, streamPlan, origin, destination } = useSim.getState();
    const snap = streamSnapshotOf(streamPlan, t);
    const routes = streamRoutes(origin, destination);
    const pos = sprites.getAttribute('position').array as Float32Array;
    const col = sprites.getAttribute('aColor').array as Float32Array;
    const siz = sprites.getAttribute('aSize').array as Float32Array;
    const kin = sprites.getAttribute('aKind').array as Float32Array;
    const pha = sprites.getAttribute('aPhase').array as Float32Array;
    const tPos = trails.getAttribute('position').array as Float32Array;
    const tCol = trails.getAttribute('color').array as Float32Array;
    let n = 0, m = 0;

    const sprite = (rgbv: readonly number[], sz: number, kind: number, phase: number) => {
      col.set([rgbv[0], rgbv[1], rgbv[2], 1], n * 4);
      siz[n] = sz; kin[n] = kind; pha[n] = phase;
      n++;
    };
    const trail = (path: StreamPath, head: number, rgbv: readonly number[]) => {
      if (reduced || m + TRAIL_SEGMENTS * 2 > MAX_TRAIL_VERTS) return;
      const from = Math.max(0, head - TRAIL_LEN);
      for (let k = 0; k < TRAIL_SEGMENTS; k++) {
        for (const j of [k, k + 1]) {
          const f = j / TRAIL_SEGMENTS;
          place(routes, path, from + (head - from) * f, tPos, m * 3);
          tCol.set([rgbv[0], rgbv[1], rgbv[2], 0.55 * f * f], m * 4);
          m++;
        }
      }
    };

    for (const mk of burstMarks(streamPlan, snap)) {
      if (n >= MAX_SPRITES) break;
      place(routes, mk.path, mk.s, pos, n * 3);
      if (mk.kind === 'packet') { trail(mk.path, mk.s, MAGENTA); sprite(MAGENTA, 0.036, KIND_DOT, 0); }
      else if (mk.kind === 'resend') { trail(mk.path, mk.s, AMBER); sprite(AMBER, 0.038, KIND_DOT, 0); }
      else sprite(RED, 0.09, KIND_LOSS, reduced ? 0.35 : mk.phase);
    }

    const pulse = reduced ? null : streamPulse(streamPlan, snap);
    if (pulse && n + 2 <= MAX_SPRITES) {
      const at = toXYZ(nodeById.get(pulse === 'origin' ? origin : destination)!.at).map((c) => c * SURFACE);
      const phase = (clock.elapsedTime * 0.7) % 1;
      for (const p of [phase, (phase + 0.5) % 1]) { pos.set(at, n * 3); sprite(WHITE, 0.16, KIND_RING, p); }
    }

    for (const name of ['position', 'aColor', 'aSize', 'aKind', 'aPhase']) sprites.getAttribute(name).needsUpdate = true;
    sprites.setDrawRange(0, n);
    trails.getAttribute('position').needsUpdate = true;
    trails.getAttribute('color').needsUpdate = true;
    trails.setDrawRange(0, m);
    if (material.current) {
      const fov = 'fov' in camera ? (camera.fov as number) : 35;
      material.current.uniforms.uScale.value = (size.height * viewport.dpr) / (2 * Math.tan((fov * Math.PI) / 360));
    }
  });

  const uniforms = useMemo(() => ({ uScale: { value: 1 } }), []);
  return (
    <>
      <lineSegments geometry={trails} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent depthWrite={false} blending={AdditiveBlending} />
      </lineSegments>
      <points geometry={sprites} frustumCulled={false}>
        <shaderMaterial ref={material} vertexShader={SPRITE_VERTEX} fragmentShader={SPRITE_FRAGMENT} uniforms={uniforms} transparent depthWrite={false} blending={AdditiveBlending} />
      </points>
    </>
  );
}
