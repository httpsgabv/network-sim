import { useMemo } from 'react';
import { AdditiveBlending, BackSide, Color } from 'three';

const vertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// Soft key light from the upper left plus a faint rim, so the globe reads as a solid without a texture.
const sphereFragment = /* glsl */ `
  uniform vec3 uCenter;
  uniform vec3 uEdge;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float light = clamp(dot(vNormal, normalize(vec3(-0.55, 0.6, 0.6))) * 0.5 + 0.5, 0.0, 1.0);
    vec3 color = mix(uEdge, uCenter, pow(light, 1.6));
    color += vec3(pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0) * 0.06);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const atmosphereFragment = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float glow = pow(clamp(0.62 + dot(vNormal, vView), 0.0, 1.0), 5.0);
    gl_FragColor = vec4(vec3(1.0), glow * 0.22);
    #include <colorspace_fragment>
  }
`;

export function Sphere() {
  const uniforms = useMemo(() => ({ uCenter: { value: new Color('#1c1c21') }, uEdge: { value: new Color('#050506') } }), []);
  return (
    <>
      <mesh>
        <sphereGeometry args={[1, 96, 96]} />
        <shaderMaterial vertexShader={vertex} fragmentShader={sphereFragment} uniforms={uniforms} />
      </mesh>
      <mesh scale={1.16}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          vertexShader={vertex}
          fragmentShader={atmosphereFragment}
          side={BackSide}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
