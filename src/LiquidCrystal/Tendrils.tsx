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
 * Flowing tendrils - SMOOTH motion with speed pump on beats
 * Uses accumulated phase so motion flows continuously, beats just accelerate it
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

  // Accumulated phase - constant flow, speeds up on beats
  const phaseRef = useRef(0);
  const lastTimeRef = useRef(0);
  const deltaTime = time - lastTimeRef.current;
  const baseSpeed = 1.0;
  const boostSpeed = 3.0; // Extra speed during beats
  phaseRef.current += (baseSpeed + decay * boostSpeed) * deltaTime;
  lastTimeRef.current = time;
  const phase = phaseRef.current;

  // Generate tendril configurations - LONGER tendrils
  const tendrils = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const radiusOffset = 0.35 + seededRandom(i * 7) * 0.25;
      return {
        baseAngle: angle,
        radiusOffset,
        length: 2.5 + seededRandom(i * 11) * 1.5, // LONGER
        phaseOffset: seededRandom(i * 13) * Math.PI * 2,
        thickness: 0.035 + seededRandom(i * 17) * 0.03,
        segments: 32, // More segments for smoothness
      };
    });
  }, [count]);

  // Shader for glowing tendrils
  const tendrilMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDecay: { value: 0 },
        uPhase: { value: 0 },
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
        uniform float uPhase;

        varying float vProgress;
        varying vec3 vPosition;

        void main() {
          // Color gradient along tendril
          vec3 attachColor = vec3(0.0, 0.8, 0.6);
          vec3 baseColor = vec3(0.0, 0.5, 0.7);
          vec3 tipColor = vec3(0.6, 0.2, 0.9);
          vec3 glowColor = vec3(0.0, 1.0, 0.8);

          // Smooth gradient
          vec3 color;
          if (vProgress < 0.1) {
            color = mix(attachColor, baseColor, vProgress / 0.1);
          } else {
            color = mix(baseColor, tipColor, (vProgress - 0.1) / 0.9);
          }

          // Glow pulses traveling down - uses accumulated phase
          float pulse = sin(vProgress * 8.0 - uPhase * 2.0);
          pulse = smoothstep(0.2, 0.8, pulse);
          color = mix(color, glowColor, pulse * 0.4 * (0.5 + uDecay));

          // Alpha: strong at base, fades toward tip
          float baseAlpha = smoothstep(0.0, 0.15, 0.15 - vProgress) * 0.5;
          float bodyAlpha = (1.0 - vProgress * 0.6) * (0.5 + uDecay * 0.3);
          float alpha = baseAlpha + bodyAlpha;

          // Subtle bioluminescent spots
          float spots = sin(vProgress * 25.0 + uPhase) * sin(vPosition.x * 15.0 + uPhase * 0.5);
          spots = smoothstep(0.85, 1.0, spots);
          color += vec3(0.4, 1.0, 0.8) * spots * 0.3;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  // Attachment node material
  const attachmentMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
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
        uniform float uDecay;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.0);

          vec3 coreColor = vec3(0.0, 0.7, 0.5);
          vec3 glowColor = vec3(0.0, 1.0, 0.8);

          vec3 color = mix(coreColor, glowColor, fresnel);
          color += glowColor * uDecay * 0.4;

          float alpha = 0.5 + fresnel * 0.3 + uDecay * 0.2;

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
  tendrilMaterial.uniforms.uPhase.value = phase;
  attachmentMaterial.uniforms.uDecay.value = decay;

  return (
    <group position={[0, -0.3, 0]}>
      {tendrils.map((tendril, i) => {
        const attachX = Math.cos(tendril.baseAngle) * tendril.radiusOffset;
        const attachZ = Math.sin(tendril.baseAngle) * tendril.radiusOffset;

        // Build curve points with SMOOTH motion
        const points: THREE.Vector3[] = [];

        for (let j = 0; j <= tendril.segments; j++) {
          const t = j / tendril.segments;

          const baseX = attachX;
          const baseZ = attachZ;
          const y = -t * tendril.length;

          // SMOOTH sway using accumulated phase
          // This creates continuous flow that speeds up on beats
          const swayAmount = Math.pow(t, 1.3) * 0.8;

          // Single smooth wave using accumulated phase
          const swayPhase = phase + tendril.phaseOffset;
          const swayX = Math.sin(swayPhase * 0.8 + t * 2.5) * swayAmount;
          const swayZ = Math.cos(swayPhase * 0.6 + t * 2.0) * swayAmount * 0.6;

          // Secondary gentle wave for organic feel
          const secondaryX = Math.sin(swayPhase * 0.3 + t * 1.2 + i) * swayAmount * 0.25;
          const secondaryZ = Math.cos(swayPhase * 0.25 + t * 1.0 + i * 0.5) * swayAmount * 0.2;

          points.push(new THREE.Vector3(
            baseX + swayX + secondaryX,
            y,
            baseZ + swayZ + secondaryZ
          ));
        }

        const curve = new THREE.CatmullRomCurve3(points);

        const baseThickness = tendril.thickness * 1.5;

        const tMat = tendrilMaterial.clone();
        tMat.uniforms.uTime.value = time;
        tMat.uniforms.uDecay.value = decay;
        tMat.uniforms.uPhase.value = phase;

        const aMat = attachmentMaterial.clone();
        aMat.uniforms.uDecay.value = decay;

        return (
          <group key={i}>
            {/* Attachment node */}
            <mesh position={[attachX, 0.05, attachZ]} scale={0.07 + decay * 0.015}>
              <sphereGeometry args={[1, 12, 12]} />
              <primitive object={aMat} attach="material" />
            </mesh>

            {/* Tendril tube */}
            <mesh>
              <tubeGeometry args={[curve, 24, baseThickness, 8, false]} />
              <primitive object={tMat} attach="material" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};
