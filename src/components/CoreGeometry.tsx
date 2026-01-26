import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface CoreGeometryProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

/**
 * Central icosahedron that pulses and distorts with the bass/kick
 * Uses vertex displacement driven by noise + audio reactivity
 */
export const CoreGeometry: React.FC<CoreGeometryProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const time = frame / fps;

  // Create custom shader material for displacement
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uEnergy: { value: 0 },
        uBeatIntensity: { value: 0 },
        uBaseColor: { value: new THREE.Color("#1a0a2e") },
        uGlowColor: { value: new THREE.Color("#ff00ff") },
        uHighlightColor: { value: new THREE.Color("#00ffff") },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uBass;
        uniform float uMid;
        uniform float uEnergy;
        uniform float uBeatIntensity;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vDisplacement;

        // Simplex noise functions
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

          vec3 i  = floor(v + dot(v, C.yyy));
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
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;

          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
          vNormal = normal;
          vPosition = position;

          // Multi-octave noise for organic displacement
          float noiseScale = 1.5;
          float noise1 = snoise(position * noiseScale + uTime * 0.3);
          float noise2 = snoise(position * noiseScale * 2.0 + uTime * 0.5) * 0.5;
          float noise3 = snoise(position * noiseScale * 4.0 + uTime * 0.7) * 0.25;
          float combinedNoise = noise1 + noise2 + noise3;

          // Bass-driven displacement (kick drum punch)
          float bassDisplacement = uBass * 0.8 * (1.0 + combinedNoise * 0.5);

          // Mid-frequency shimmer
          float midDisplacement = uMid * 0.2 * noise2;

          // Beat punch effect
          float beatPunch = uBeatIntensity * 0.3;

          // Total displacement
          float displacement = bassDisplacement + midDisplacement + beatPunch;
          displacement *= 1.0 + uEnergy * 0.5;

          vDisplacement = displacement;

          // Apply displacement along normal
          vec3 newPosition = position + normal * displacement;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uBass;
        uniform float uEnergy;
        uniform float uBeatIntensity;
        uniform vec3 uBaseColor;
        uniform vec3 uGlowColor;
        uniform vec3 uHighlightColor;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vDisplacement;

        void main() {
          // Fresnel effect for edge glow
          vec3 viewDirection = normalize(cameraPosition - vPosition);
          float fresnel = pow(1.0 - abs(dot(viewDirection, vNormal)), 3.0);

          // Color mixing based on audio
          vec3 baseColor = uBaseColor;
          vec3 glowColor = mix(uGlowColor, uHighlightColor, uBass);

          // Displacement coloring
          float displaceColor = smoothstep(0.0, 0.5, vDisplacement);

          // Final color
          vec3 color = mix(baseColor, glowColor, fresnel + displaceColor * 0.5);
          color += glowColor * uBeatIntensity * 0.5;
          color += uHighlightColor * fresnel * uEnergy * 0.8;

          // Pulsing inner glow
          float pulse = 0.5 + 0.5 * sin(uTime * 2.0);
          color += uGlowColor * pulse * 0.1 * (1.0 + uBass);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      transparent: false,
      side: THREE.DoubleSide,
    });
  }, []);

  // Update uniforms every frame
  shaderMaterial.uniforms.uTime.value = time;
  shaderMaterial.uniforms.uBass.value = audioFrame.bass;
  shaderMaterial.uniforms.uMid.value = audioFrame.mid;
  shaderMaterial.uniforms.uEnergy.value = audioFrame.energy;
  shaderMaterial.uniforms.uBeatIntensity.value = audioFrame.beatIntensity;

  // Slow rotation
  const rotationY = time * 0.2;
  const rotationX = time * 0.1;

  // Scale pulse on beats
  const baseScale = 1.5;
  const beatScale = 1 + audioFrame.beatIntensity * 0.15;

  return (
    <mesh
      ref={meshRef}
      rotation={[rotationX, rotationY, 0]}
      scale={baseScale * beatScale}
    >
      <icosahedronGeometry args={[1, 64]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
};
