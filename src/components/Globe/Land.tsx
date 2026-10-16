import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferGeometry, Color, Float32BufferAttribute, type ShaderMaterial } from 'three';
import flat from '../../data/landDots.json';
import { latLonLines, toXYZ } from '../../lib/globe';

const vertex = /* glsl */ `
  uniform float uSize;
  uniform float uScale;
  varying float vFacing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(normalMatrix * position), normalize(-mv.xyz));
    gl_PointSize = uSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFacing;
  void main() {
    if (length(gl_PointCoord - 0.5) > 0.5) discard;
    // fade dots out towards the limb so the silhouette stays clean
    gl_FragColor = vec4(uColor, uOpacity * smoothstep(0.02, 0.35, vFacing));
    #include <colorspace_fragment>
  }
`;

/** Dot diameter in world units (globe radius = 1). */
const DOT_SIZE = 0.0095;

export function Land() {
  const { camera, size, viewport } = useThree();

  const dots = useMemo(() => {
    const pos: number[] = [];
    for (let i = 0; i < flat.length; i += 2) pos.push(...toXYZ([flat[i], flat[i + 1]]).map((c) => c * 1.001));
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    return g;
  }, []);

  const graticule = useMemo(() => {
    const pos: number[] = [];
    for (const line of latLonLines(20)) {
      for (let i = 1; i < line.length; i++) pos.push(...toXYZ(line[i - 1]), ...toXYZ(line[i]));
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos.map((c) => c * 1.0005), 3));
    return g;
  }, []);

  const uniforms = useMemo(
    () => ({ uColor: { value: new Color('#71717a') }, uOpacity: { value: 0.8 }, uSize: { value: DOT_SIZE }, uScale: { value: 1 } }),
    [],
  );

  const material = useRef<ShaderMaterial>(null);

  // world size → pixels: depends on canvas height, dpr and fov
  useFrame(() => {
    if (!material.current) return;
    const fov = 'fov' in camera ? (camera.fov as number) : 35;
    material.current.uniforms.uScale.value = (size.height * viewport.dpr) / (2 * Math.tan((fov * Math.PI) / 360));
  });

  return (
    <>
      <lineSegments geometry={graticule}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.045} depthWrite={false} />
      </lineSegments>
      <points geometry={dots}>
        <shaderMaterial ref={material} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent depthWrite={false} />
      </points>
    </>
  );
}
