import { useMemo } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface CentralVoidProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

/**
 * Central void - a black hole that warps space
 * Emits distortion rings on beats
 */
export const CentralVoid: React.FC<CentralVoidProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDecay: { value: 0 },
        uDecayPhase: { value: 0 },
        uBass: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uDecayPhase;

        varying vec3 vPosition;
        varying vec3 vNormal;
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
          vNormal = normal;
          vPosition = position;

          // Spherical distortion pulling inward
          float dist = length(position);

          // Surface turbulence driven by decay
          vec3 noisePos = position * 3.0;
          noisePos.x += uDecayPhase * 0.5;
          float turb = snoise(noisePos + uTime * 0.3) * 0.15 * uDecay;

          // Breathing - contracts and expands
          float breathe = sin(uTime * 2.0) * 0.05 + uDecay * 0.1;

          // Pull everything slightly inward (black hole effect)
          float pull = -0.1 - uDecay * 0.15;

          vDistortion = turb;

          vec3 newPos = position + normal * (pull + turb + breathe);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uDecayPhase;
        uniform float uBass;

        varying vec3 vPosition;
        varying vec3 vNormal;
        varying float vDistortion;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vPosition);

          // Fresnel - bright edge
          float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 4.0);

          // Event horizon glow
          vec3 voidColor = vec3(0.0, 0.0, 0.0);
          vec3 edgeColor = vec3(1.0, 1.0, 1.0);
          vec3 accentCyan = vec3(0.0, 1.0, 1.0);
          vec3 accentMagenta = vec3(1.0, 0.0, 1.0);

          // Core is pure black
          vec3 color = voidColor;

          // Edge glow - stark white with color accents
          float edgeGlow = fresnel * (0.5 + uDecay * 1.5);
          color += edgeColor * edgeGlow;

          // Color shifting at edge
          float colorShift = sin(uDecayPhase + vPosition.y * 5.0);
          vec3 accent = mix(accentCyan, accentMagenta, colorShift * 0.5 + 0.5);
          color += accent * fresnel * uDecay * 0.8;

          // Distortion highlights
          float distHighlight = smoothstep(0.05, 0.15, abs(vDistortion));
          color += accent * distHighlight * 0.5;

          // Keep center very dark
          float centerDark = 1.0 - fresnel;
          color *= 0.1 + fresnel * 0.9;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide, // Render inside of sphere
    });
  }, []);

  shaderMaterial.uniforms.uTime.value = time;
  shaderMaterial.uniforms.uDecay.value = decay;
  shaderMaterial.uniforms.uDecayPhase.value = audioFrame.decayPhase ?? 0;
  shaderMaterial.uniforms.uBass.value = audioFrame.bass;

  // Scale pulses on beats
  const scale = 1.2 + decay * 0.3;

  return (
    <mesh scale={scale}>
      <sphereGeometry args={[1, 64, 64]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
};
