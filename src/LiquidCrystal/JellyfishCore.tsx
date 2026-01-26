import { useMemo } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface JellyfishCoreProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

/**
 * Jellyfish bell - organic pulsing, refined intensity
 * Contracts on beats, beautiful displacement, internal glow
 */
export const JellyfishCore: React.FC<JellyfishCoreProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const time = frame / fps;
  const pulse = audioFrame.pulse ?? 0;
  const bass = audioFrame.bass;

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDecay: { value: 0 },
        uDecayPhase: { value: 0 },
        uMid: { value: 0 },
        uBass: { value: 0 },
        uEnergy: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uDecayPhase;
        uniform float uMid;
        uniform float uBass;
        uniform float uEnergy;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying float vDisplacement;

        // Simplex noise
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

          float verticalPos = position.y;
          float bellFactor = smoothstep(-1.0, 0.5, verticalPos);

          // Smooth contraction on beats
          float contraction = uDecay * 0.3 * bellFactor;

          // Organic undulation - smooth, not chaotic
          vec3 noisePos = position * 2.0;
          noisePos.x += uDecayPhase * 0.4;
          float undulation = snoise(noisePos + uTime * 0.3) * 0.12;
          undulation += snoise(noisePos * 1.5 + uTime * 0.5) * 0.06;
          undulation *= (1.0 + uMid * 0.5 + uDecay * 0.8);

          // Gentle ripple waves
          float ripple = sin(verticalPos * 8.0 - uTime * 3.0 - uDecayPhase * 2.0) * 0.04 * uDecay;

          // Breathe
          float breathe = sin(uTime * 1.5) * 0.06;

          float displacement = -contraction + undulation + ripple + breathe;
          vDisplacement = displacement;

          vec3 newPosition = position + normal * displacement;

          // Flatten bottom for bell shape - smooth transition to avoid seam
          float flattenStart = -0.2;
          float flattenFull = -0.4;
          float flattenFactor = smoothstep(flattenStart, flattenFull, newPosition.y);
          float flattenedY = flattenStart - (newPosition.y - flattenStart) * 0.3;
          newPosition.y = mix(newPosition.y, flattenedY, flattenFactor);

          vWorldPosition = (modelMatrix * vec4(newPosition, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uDecayPhase;
        uniform float uBass;
        uniform float uEnergy;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying float vDisplacement;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);

          // Fresnel rim
          float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 3.0);

          float verticalGrad = smoothstep(-0.5, 0.5, vPosition.y);

          // Beautiful bioluminescent colors
          vec3 coreColor = vec3(0.0, 0.5, 0.4);
          vec3 rimColor = vec3(0.0, 0.4, 0.8);
          vec3 pulseColor = vec3(0.1, 0.9, 0.7);

          vec3 color = mix(coreColor, rimColor, fresnel * 0.6);

          // Pulse glow on beats
          float pulseIntensity = uDecay * 0.8;
          color = mix(color, pulseColor, pulseIntensity * verticalGrad);

          // Rim light
          color += rimColor * fresnel * (0.4 + uDecay * 0.6);

          // Internal veins - subtle
          float veinPattern = sin(vPosition.x * 15.0 + uTime * 2.0 + uDecayPhase) *
                             sin(vPosition.y * 12.0 - uDecayPhase * 1.5) *
                             sin(vPosition.z * 14.0 + uTime * 1.5);
          veinPattern = smoothstep(0.6, 1.0, veinPattern);
          color += vec3(0.2, 0.8, 0.7) * veinPattern * (0.2 + uDecay * 0.3);

          // Alpha
          float alpha = 0.35 + fresnel * 0.45 + uDecay * 0.15;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);

  shaderMaterial.uniforms.uTime.value = time;
  shaderMaterial.uniforms.uDecay.value = pulse;
  shaderMaterial.uniforms.uDecayPhase.value = audioFrame.pulsePhase ?? 0;
  shaderMaterial.uniforms.uMid.value = audioFrame.mid;
  shaderMaterial.uniforms.uBass.value = bass;
  shaderMaterial.uniforms.uEnergy.value = audioFrame.energy;

  return (
    <mesh>
      <sphereGeometry args={[1, 32, 32, Math.PI]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
};
