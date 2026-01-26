import { useMemo, useRef, useEffect } from "react";
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
  // Handles Remotion loop/seek by detecting time going backwards
  const phaseRef = useRef(0);
  const lastTimeRef = useRef(0);

  const baseSpeed = 1.0;
  const boostSpeed = 3.0;

  // Detect loop/seek - reset if time goes backwards
  if (time < lastTimeRef.current - 0.05) {
    phaseRef.current = time * baseSpeed;
  }

  const deltaTime = Math.min(time - lastTimeRef.current, 0.1);
  if (deltaTime > 0) {
    phaseRef.current += (baseSpeed + decay * boostSpeed) * deltaTime;
  }
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

  // Pre-compute curves and geometries only when phase changes significantly
  // Using a quantized phase to reduce geometry rebuilds while keeping smooth animation
  const quantizedPhase = Math.floor(phase * 30) / 30; // ~30 updates per second of phase

  const tendrilGeometries = useMemo(() => {
    return tendrils.map((tendril, i) => {
      const attachX = Math.cos(tendril.baseAngle) * tendril.radiusOffset;
      const attachZ = Math.sin(tendril.baseAngle) * tendril.radiusOffset;

      const points: THREE.Vector3[] = [];

      for (let j = 0; j <= tendril.segments; j++) {
        const t = j / tendril.segments;
        const y = -t * tendril.length;

        const swayAmount = Math.pow(t, 1.3) * 0.8;
        const swayPhase = quantizedPhase + tendril.phaseOffset;
        const swayX = Math.sin(swayPhase * 0.8 + t * 2.5) * swayAmount;
        const swayZ = Math.cos(swayPhase * 0.6 + t * 2.0) * swayAmount * 0.6;

        const secondaryX = Math.sin(swayPhase * 0.3 + t * 1.2 + i) * swayAmount * 0.25;
        const secondaryZ = Math.cos(swayPhase * 0.25 + t * 1.0 + i * 0.5) * swayAmount * 0.2;

        points.push(new THREE.Vector3(
          attachX + swayX + secondaryX,
          y,
          attachZ + swayZ + secondaryZ
        ));
      }

      const curve = new THREE.CatmullRomCurve3(points);
      return {
        attachX,
        attachZ,
        tubeGeom: new THREE.TubeGeometry(curve, 24, tendril.thickness * 1.5, 8, false),
      };
    });
  }, [tendrils, quantizedPhase]);

  // Dispose old geometries when they change
  const prevGeometriesRef = useRef<THREE.TubeGeometry[]>([]);
  useEffect(() => {
    // Dispose previous geometries
    prevGeometriesRef.current.forEach(geom => geom.dispose());
    // Store current for next cleanup
    prevGeometriesRef.current = tendrilGeometries.map(g => g.tubeGeom);
  }, [tendrilGeometries]);

  // Tendrils trail BEHIND the jellyfish (in +Z direction)
  // Jellyfish swims in -Z, so tendrils extend toward +Z
  return (
    <group position={[0, 0, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
      {tendrilGeometries.map((geom, i) => (
        <group key={i}>
          {/* Attachment node */}
          <mesh position={[geom.attachX, 0.05, geom.attachZ]} scale={0.07 + decay * 0.015}>
            <sphereGeometry args={[1, 8, 8]} />
            <primitive object={attachmentMaterial} attach="material" />
          </mesh>

          {/* Tendril tube - shared material, geometry from memo */}
          <mesh geometry={geom.tubeGeom}>
            <primitive object={tendrilMaterial} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
};
