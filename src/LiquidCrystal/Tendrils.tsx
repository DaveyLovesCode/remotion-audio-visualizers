import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface TendrilsProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
  count?: number;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Flowing tendrils hanging from the jellyfish bell
 * Sway organically with mid frequencies
 */
export const Tendrils: React.FC<TendrilsProps> = ({
  frame,
  audioFrame,
  fps,
  count = 12,
}) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;
  const mid = audioFrame.mid;

  // Generate tendril configurations
  const tendrils = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const radiusOffset = 0.3 + seededRandom(i * 7) * 0.3;
      return {
        baseAngle: angle,
        radiusOffset,
        length: 1.5 + seededRandom(i * 11) * 1.5,
        phaseOffset: seededRandom(i * 13) * Math.PI * 2,
        thickness: 0.03 + seededRandom(i * 17) * 0.04,
        segments: 24,
      };
    });
  }, [count]);

  // Shader for glowing tendrils - thicker and more opaque at base
  const tendrilMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDecay: { value: 0 },
        uMid: { value: 0 },
      },
      vertexShader: `
        varying float vProgress;
        varying vec3 vPosition;

        void main() {
          vProgress = uv.y;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uMid;

        varying float vProgress;
        varying vec3 vPosition;

        void main() {
          // Color gradient along tendril
          vec3 attachColor = vec3(0.0, 0.9, 0.7);  // Bright at attachment
          vec3 baseColor = vec3(0.0, 0.6, 0.8);
          vec3 tipColor = vec3(0.8, 0.2, 1.0);
          vec3 glowColor = vec3(0.0, 1.0, 0.8);

          // Start bright at attachment, then gradient
          vec3 color;
          if (vProgress < 0.1) {
            color = mix(attachColor, baseColor, vProgress / 0.1);
          } else {
            color = mix(baseColor, tipColor, (vProgress - 0.1) / 0.9);
          }

          // Glow pulses traveling down
          float pulse = sin(vProgress * 10.0 - uTime * 4.0);
          pulse = smoothstep(0.3, 1.0, pulse);
          color = mix(color, glowColor, pulse * 0.5 * (1.0 + uDecay));

          // Alpha: strong at base, fades toward tip
          float baseAlpha = smoothstep(0.0, 0.15, 0.15 - vProgress) * 0.4; // Extra opacity at base
          float bodyAlpha = (1.0 - vProgress * 0.7) * (0.4 + uDecay * 0.4);
          float alpha = baseAlpha + bodyAlpha;

          // Bioluminescent spots
          float spots = sin(vProgress * 30.0 + uTime * 2.0) * sin(vPosition.x * 20.0);
          spots = smoothstep(0.8, 1.0, spots);
          color += vec3(0.5, 1.0, 0.8) * spots * 0.5;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  // Attachment node material - glowing spheres where tendrils meet the bell
  const attachmentMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDecay: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normal;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDecay;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.0);

          vec3 coreColor = vec3(0.0, 0.8, 0.6);
          vec3 glowColor = vec3(0.0, 1.0, 0.9);

          vec3 color = mix(coreColor, glowColor, fresnel);
          color += glowColor * uDecay * 0.5;

          float alpha = 0.6 + fresnel * 0.3 + uDecay * 0.2;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  tendrilMaterial.uniforms.uTime.value = time;
  tendrilMaterial.uniforms.uDecay.value = decay;
  tendrilMaterial.uniforms.uMid.value = mid;
  attachmentMaterial.uniforms.uTime.value = time;
  attachmentMaterial.uniforms.uDecay.value = decay;

  return (
    <group position={[0, -0.3, 0]}>
      {tendrils.map((tendril, i) => {
        // Attachment point position
        const attachX = Math.cos(tendril.baseAngle) * tendril.radiusOffset;
        const attachZ = Math.sin(tendril.baseAngle) * tendril.radiusOffset;

        // Build curve points with organic sway
        const points: THREE.Vector3[] = [];

        for (let j = 0; j <= tendril.segments; j++) {
          const t = j / tendril.segments;

          // Base position hanging down
          const baseX = attachX;
          const baseZ = attachZ;
          const y = -t * tendril.length;

          // Organic sway - more movement further down the tendril
          const swayAmount = t * t * 0.8;
          const swaySpeed = 1.5 + mid * 2.0;
          const swayX = Math.sin(time * swaySpeed + tendril.phaseOffset + t * 3.0) * swayAmount;
          const swayZ = Math.cos(time * swaySpeed * 0.7 + tendril.phaseOffset + t * 2.5) * swayAmount * 0.6;

          // Beat pulse - wave traveling down
          const pulseWave = Math.sin(t * 4.0 - time * 6.0 - decay * 3.0) * 0.1 * decay;

          points.push(new THREE.Vector3(
            baseX + swayX + pulseWave,
            y,
            baseZ + swayZ
          ));
        }

        const curve = new THREE.CatmullRomCurve3(points);

        // Tendril thickness tapers: thicker at base, thinner at tip
        const baseThickness = tendril.thickness * 1.8;

        const tMat = tendrilMaterial.clone();
        tMat.uniforms.uTime.value = time;
        tMat.uniforms.uDecay.value = decay;
        tMat.uniforms.uMid.value = mid;

        const aMat = attachmentMaterial.clone();
        aMat.uniforms.uTime.value = time;
        aMat.uniforms.uDecay.value = decay;

        return (
          <group key={i}>
            {/* Attachment node - glowing sphere at base */}
            <mesh position={[attachX, 0.05, attachZ]} scale={0.08 + decay * 0.02}>
              <sphereGeometry args={[1, 16, 16]} />
              <primitive object={aMat} attach="material" />
            </mesh>

            {/* Tendril tube */}
            <mesh>
              <tubeGeometry args={[curve, 20, baseThickness, 8, false]} />
              <primitive object={tMat} attach="material" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};
