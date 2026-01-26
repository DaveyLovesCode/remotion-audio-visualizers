import { useMemo } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface JellyfishCoreProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

/**
 * Central jellyfish bell - translucent, pulsing with bass
 * Contracts on beat, relaxes with decay
 */
export const JellyfishCore: React.FC<JellyfishCoreProps> = ({
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
        uMid: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uDecayPhase;
        uniform float uMid;

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

          // Bell shape: contract top, expand bottom on beat
          float verticalPos = position.y; // -1 to 1 on sphere
          float bellFactor = smoothstep(-1.0, 0.5, verticalPos);

          // Contract the bell on decay (inverted - squish when energy high)
          float contraction = uDecay * 0.25 * bellFactor;

          // Organic undulation
          float undulation = snoise(vec3(
            position.x * 2.0 + uDecayPhase * 0.3,
            position.y * 2.0,
            uTime * 0.5
          )) * 0.15 * (1.0 + uMid * 0.5);

          // Ripple pattern traveling down the bell
          float ripple = sin(verticalPos * 8.0 - uTime * 3.0 - uDecayPhase * 2.0) * 0.05 * uDecay;

          float displacement = -contraction + undulation + ripple;
          vDisplacement = displacement;

          vec3 newPosition = position + normal * displacement;

          // Flatten the bottom to create bell shape
          if (newPosition.y < -0.3) {
            newPosition.y = -0.3 - (newPosition.y + 0.3) * 0.3;
          }

          vWorldPosition = (modelMatrix * vec4(newPosition, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uDecayPhase;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying float vDisplacement;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);

          // Fresnel - strong rim glow
          float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 3.0);

          // Internal glow gradient
          float verticalGrad = smoothstep(-0.5, 0.5, vPosition.y);

          // Base colors - deep sea bioluminescence
          vec3 coreColor = vec3(0.0, 0.8, 0.6);  // Teal
          vec3 rimColor = vec3(0.0, 0.5, 1.0);   // Blue
          vec3 pulseColor = vec3(0.4, 1.0, 0.8); // Bright cyan

          // Color blend
          vec3 color = mix(coreColor, rimColor, fresnel * 0.7);

          // Pulse glow on decay
          color = mix(color, pulseColor, uDecay * 0.6 * verticalGrad);

          // Add rim light
          color += rimColor * fresnel * (0.5 + uDecay * 0.5);

          // Internal veins - animated pattern
          float veinPattern = sin(vPosition.x * 15.0 + uTime * 2.0) *
                             sin(vPosition.y * 10.0 - uDecayPhase) *
                             sin(vPosition.z * 12.0 + uTime);
          veinPattern = smoothstep(0.7, 1.0, veinPattern);
          color += vec3(0.2, 0.8, 1.0) * veinPattern * 0.3;

          // Alpha: translucent body, stronger at edges
          float alpha = 0.3 + fresnel * 0.5 + uDecay * 0.2;

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
  shaderMaterial.uniforms.uDecay.value = decay;
  shaderMaterial.uniforms.uDecayPhase.value = audioFrame.decayPhase ?? 0;
  shaderMaterial.uniforms.uMid.value = audioFrame.mid;

  // Gentle rotation
  const rotY = time * 0.15;

  return (
    <mesh rotation={[0, rotY, 0]} scale={1.2}>
      <sphereGeometry args={[1, 64, 64]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
};
