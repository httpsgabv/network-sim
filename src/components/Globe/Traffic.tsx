import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  type ShaderMaterial,
} from 'three';
import { nodeById } from '../../data/network';
import { toXYZ, TRANSIT } from '../../lib/globe';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { STAGE_START, END } from '../../sim/engine';
import type { Route } from '../../sim/route';
import { snapshotOf } from '../../lib/useSim';
import { useSim } from '../../store';

// ponytail: beyond this many packets we draw every k-th one; the buffer card still shows all of them.
const MAX_PACKETS = 500;
const MAX_SPRITES = MAX_PACKETS + 8;
const TRAIL_SEGMENTS = 8;
const MAX_TRAIL_VERTS = (MAX_PACKETS + 1) * TRAIL_SEGMENTS * 2;
const SURFACE = 1.004;

/** Sprite kinds understood by SPRITE_FRAGMENT (shared with StreamTraffic). */
export const KIND_DOT = 0, KIND_RING = 1, KIND_LOSS = 2;
const rgb = (hex: string) => new Color(hex).toArray() as [number, number, number];
const WHITE = rgb('#ffffff'), AMBER = rgb('#f5a524'), RED = rgb('#ef4444'), MAGENTA = rgb(TRANSIT);

export const SPRITE_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  attribute float aKind;
  attribute float aPhase;
  uniform float uScale;
  varying vec4 vColor;
  varying float vKind;
  varying float vPhase;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vKind = aKind;
    vPhase = aPhase;
  }
`;

// One sprite shader for three marks: glowing dot (packet), expanding ring (pulse), ring + × (loss).
export const SPRITE_FRAGMENT = /* glsl */ `
  varying vec4 vColor;
  varying float vKind;
  varying float vPhase;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float a;
    vec3 color = vColor.rgb;
    if (vKind < 0.5) {
      float halo = smoothstep(0.5, 0.0, d);
      a = halo * halo * 0.55 + smoothstep(0.17, 0.11, d);
      // white-hot core: a packet still reads as a dot when it sits on a route of its own colour
      color = mix(color, vec3(1.0), smoothstep(0.1, 0.03, d) * 0.85);
    } else {
      float r = mix(0.08, 0.46, vPhase);
      a = smoothstep(0.03, 0.0, abs(d - r)) * (1.0 - vPhase);
      if (vKind > 1.5) {
        float x = min(abs(p.x - p.y), abs(p.x + p.y));
        a = max(a, step(d, 0.12) * smoothstep(0.035, 0.0, x));
      }
    }
    if (a < 0.01) discard;
    gl_FragColor = vec4(color, vColor.a * a);
    #include <colorspace_fragment>
  }
`;

function place(route: Route, s: number, out: Float32Array, i: number) {
  const r = route.posAt(s);
  const [x, y, z] = toXYZ(r.at), k = SURFACE + r.h;
  out[i] = x * k; out[i + 1] = y * k; out[i + 2] = z * k;
}

const surfaceAt = (id: string) => toXYZ(nodeById.get(id)!.at).map((c) => c * SURFACE);

export function Traffic() {
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
    const { t, plan, route } = useSim.getState();
    const snap = snapshotOf(plan, t);

    const pos = sprites.getAttribute('position').array as Float32Array;
    const col = sprites.getAttribute('aColor').array as Float32Array;
    const siz = sprites.getAttribute('aSize').array as Float32Array;
    const kin = sprites.getAttribute('aKind').array as Float32Array;
    const pha = sprites.getAttribute('aPhase').array as Float32Array;
    const tPos = trails.getAttribute('position').array as Float32Array;
    const tCol = trails.getAttribute('color').array as Float32Array;
    let n = 0, m = 0;

    const sprite = (rgbv: readonly number[], alpha: number, sz: number, kind: number, phase: number) => {
      col.set([rgbv[0], rgbv[1], rgbv[2], alpha], n * 4);
      siz[n] = sz; kin[n] = kind; pha[n] = phase;
      n++;
    };
    const at = (s: number, rgbv: readonly number[], alpha: number, sz: number, kind = KIND_DOT, phase = 0) => {
      if (n >= MAX_SPRITES) return;
      place(route, s, pos, n * 3);
      sprite(rgbv, alpha, sz, kind, phase);
    };
    const atPoint = (xyz: number[], rgbv: readonly number[], sz: number, phase: number) => {
      if (n >= MAX_SPRITES) return;
      pos.set(xyz, n * 3);
      sprite(rgbv, 0.9, sz, KIND_RING, phase);
    };
    // Trail from `from` (tail, transparent) to `to` (head, bright); `to` may be behind `from` (SACK).
    const trail = (from: number, to: number, rgbv: readonly number[], alpha: number) => {
      if (reduced || m + TRAIL_SEGMENTS * 2 > MAX_TRAIL_VERTS) return;
      for (let k = 0; k < TRAIL_SEGMENTS; k++) {
        for (const j of [k, k + 1]) {
          const f = j / TRAIL_SEGMENTS;
          place(route, from + (to - from) * f, tPos, m * 3);
          tCol.set([rgbv[0], rgbv[1], rgbv[2], alpha * f * f], m * 4);
          m++;
        }
      }
    };

    const stride = Math.max(1, Math.ceil(snap.packets.length / MAX_PACKETS));
    for (let i = 0; i < snap.packets.length; i += stride) {
      const p = snap.packets[i];
      if (p.pos === null) continue;
      if (p.state === 'transit') {
        trail(Math.max(0, p.pos - 0.05), p.pos, MAGENTA, 0.55);
        at(p.pos, MAGENTA, 1, 0.036);
      } else if (p.state === 'resend') {
        trail(Math.max(0, p.pos - 0.07), p.pos, AMBER, 0.55);
        at(p.pos, AMBER, 1, 0.038);
      } else if (p.state === 'lost') {
        const lostTime = plan.packets[p.seq].lostTime!;
        at(p.pos, RED, 1, 0.09, KIND_LOSS, reduced ? 0.35 : Math.min(1, (t - lostTime) / 12));
      }
    }

    // the packet picked in the buffer card gets a steady ring so it can be found on the globe
    const picked = snap.packets[useSim.getState().selected];
    if (picked?.pos != null) at(picked.pos, WHITE, 1, 0.075, KIND_RING, 0.3);

    if (snap.sack !== null) {
      trail(Math.min(1, snap.sack + 0.08), snap.sack, AMBER, 0.6);
      at(snap.sack, AMBER, 1, 0.05);
    }

    // Two staggered rings pulse at the sender while sending, and at the receiver on delivery.
    const pulseAt = t < STAGE_START.transit ? surfaceAt(route.hops[0]) : t >= STAGE_START.decrypt && t < END ? surfaceAt(route.hops.at(-1)!) : null;
    if (pulseAt && !reduced) {
      const phase = (clock.elapsedTime * 0.7) % 1;
      atPoint(pulseAt, WHITE, 0.16, phase);
      atPoint(pulseAt, WHITE, 0.16, (phase + 0.5) % 1);
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
        <shaderMaterial
          ref={material}
          vertexShader={SPRITE_VERTEX}
          fragmentShader={SPRITE_FRAGMENT}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
    </>
  );
}
