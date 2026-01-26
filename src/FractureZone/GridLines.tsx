import { useMemo } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface GridLinesProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

/**
 * Pulsing wireframe grid surrounding the void
 * Distorts and glows on beats
 */
export const GridLines: React.FC<GridLinesProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;
  const decayPhase = audioFrame.decayPhase ?? 0;

  // Grid shader
  const gridMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDecay: { value: 0 },
        uDecayPhase: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uDecayPhase;

        varying vec3 vPosition;
        varying float vDistortion;

        // Noise
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
          // Distort grid points - pull toward center on beats
          float dist = length(position);

          // Noise-based distortion
          vec3 noisePos = position * 0.5;
          noisePos.y += uDecayPhase * 0.2;
          float distortion = snoise(noisePos + uTime * 0.2) * uDecay * 0.3;

          // Gravitational pull toward center
          vec3 toCenter = -normalize(position);
          float pullStrength = uDecay * 0.5 / (dist * 0.5 + 1.0);

          vec3 newPos = position;
          newPos += toCenter * pullStrength;
          newPos += normalize(position) * distortion;

          vPosition = position;
          vDistortion = distortion;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uDecayPhase;

        varying vec3 vPosition;
        varying float vDistortion;

        void main() {
          // Base grid color - dim cyan
          vec3 baseColor = vec3(0.0, 0.3, 0.4);
          vec3 glowColor = vec3(0.0, 1.0, 1.0);
          vec3 hotColor = vec3(1.0, 1.0, 1.0);

          // Distance from center affects brightness
          float dist = length(vPosition);
          float distFade = smoothstep(8.0, 2.0, dist);

          // Pulse traveling outward
          float pulse = sin(dist * 2.0 - uTime * 4.0 - uDecayPhase * 3.0);
          pulse = smoothstep(0.3, 1.0, pulse) * uDecay;

          // Color blend
          vec3 color = baseColor;
          color = mix(color, glowColor, distFade * (0.3 + uDecay * 0.7));
          color = mix(color, hotColor, pulse * 0.5);

          // Distortion highlights
          color += abs(vDistortion) * glowColor * 2.0;

          float alpha = 0.3 + uDecay * 0.5 + pulse * 0.3;
          alpha *= distFade;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);

  gridMaterial.uniforms.uTime.value = time;
  gridMaterial.uniforms.uDecay.value = decay;
  gridMaterial.uniforms.uDecayPhase.value = decayPhase;

  // Create multiple grid spheres at different radii
  const gridLayers = [
    { radius: 3, segments: 16 },
    { radius: 5, segments: 20 },
    { radius: 7, segments: 24 },
  ];

  // Slow rotation
  const rotation = time * 0.05;

  return (
    <group rotation={[0, rotation, rotation * 0.3]}>
      {gridLayers.map((layer, i) => (
        <lineSegments key={i}>
          <wireframeGeometry
            args={[new THREE.IcosahedronGeometry(layer.radius, 2)]}
          />
          <primitive object={gridMaterial.clone()} attach="material" />
        </lineSegments>
      ))}
    </group>
  );
};
