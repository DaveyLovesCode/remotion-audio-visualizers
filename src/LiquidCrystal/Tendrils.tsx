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
 * Flowing tendrils - GPU-animated sway (no geometry rebuilds)
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

  // Accumulated phase - constant flow, speeds up on beats
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

  // Generate tendril configurations
  const tendrils = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const radiusOffset = 0.35 + seededRandom(i * 7) * 0.25;
      return {
        baseAngle: angle,
        radiusOffset,
        length: 2.5 + seededRandom(i * 11) * 1.5,
        phaseOffset: seededRandom(i * 13) * Math.PI * 2,
        thickness: 0.035 + seededRandom(i * 17) * 0.03,
        index: i,
      };
    });
  }, [count]);

  // Create static tube geometries ONCE - straight tubes animated in shader
  const tendrilGeometries = useMemo(() => {
    return tendrils.map((tendril) => {
      const attachX = Math.cos(tendril.baseAngle) * tendril.radiusOffset;
      const attachZ = Math.sin(tendril.baseAngle) * tendril.radiusOffset;

      // Create straight tube pointing down from attachment point
      const points = [];
      const segments = 32;
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        points.push(new THREE.Vector3(attachX, -t * tendril.length, attachZ));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeom = new THREE.TubeGeometry(curve, 24, tendril.thickness * 1.5, 8, false);

      return { attachX, attachZ, tubeGeom, tendril };
    });
  }, [tendrils]);

  // Per-tendril materials for individual phaseOffset/index
  const tendrilMaterials = useMemo(() => {
    return tendrils.map((tendril) => {
      return new THREE.ShaderMaterial({
        uniforms: {
          uDecay: { value: 0 },
          uPhase: { value: 0 },
          uPhaseOffset: { value: tendril.phaseOffset },
          uTendrilIndex: { value: tendril.index },
        },
        vertexShader: `
          uniform float uPhase;
          uniform float uPhaseOffset;
          uniform float uTendrilIndex;

          varying float vProgress;
          varying vec3 vAnimatedPos;

          void main() {
            float t = uv.y;
            vProgress = t;

            float swayAmount = pow(t, 1.3) * 0.8;
            float swayPhase = uPhase + uPhaseOffset;

            float swayX = sin(swayPhase * 0.8 + t * 2.5) * swayAmount;
            float swayZ = cos(swayPhase * 0.6 + t * 2.0) * swayAmount * 0.6;

            float secondaryX = sin(swayPhase * 0.3 + t * 1.2 + uTendrilIndex) * swayAmount * 0.25;
            float secondaryZ = cos(swayPhase * 0.25 + t * 1.0 + uTendrilIndex * 0.5) * swayAmount * 0.2;

            vec3 animatedPos = position;
            animatedPos.x += swayX + secondaryX;
            animatedPos.z += swayZ + secondaryZ;

            vAnimatedPos = animatedPos;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(animatedPos, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uDecay;
          uniform float uPhase;

          varying float vProgress;
          varying vec3 vAnimatedPos;

          void main() {
            vec3 attachColor = vec3(0.0, 0.8, 0.6);
            vec3 baseColor = vec3(0.0, 0.5, 0.7);
            vec3 tipColor = vec3(0.6, 0.2, 0.9);
            vec3 glowColor = vec3(0.0, 1.0, 0.8);

            vec3 color;
            if (vProgress < 0.1) {
              color = mix(attachColor, baseColor, vProgress / 0.1);
            } else {
              color = mix(baseColor, tipColor, (vProgress - 0.1) / 0.9);
            }

            float pulse = sin(vProgress * 8.0 - uPhase * 2.0);
            pulse = smoothstep(0.2, 0.8, pulse);
            color = mix(color, glowColor, pulse * 0.4 * (0.5 + uDecay));

            float baseAlpha = smoothstep(0.0, 0.15, 0.15 - vProgress) * 0.5;
            float bodyAlpha = (1.0 - vProgress * 0.6) * (0.5 + uDecay * 0.3);
            float alpha = baseAlpha + bodyAlpha;

            float spots = sin(vProgress * 25.0 + uPhase) * sin(vAnimatedPos.x * 15.0 + uPhase * 0.5);
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
    });
  }, [tendrils]);

  // Shared attachment sphere geometry
  const attachmentGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);

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

  // Update uniforms
  tendrilMaterials.forEach((mat) => {
    mat.uniforms.uDecay.value = decay;
    mat.uniforms.uPhase.value = phase;
  });
  attachmentMaterial.uniforms.uDecay.value = decay;

  return (
    <group position={[0, 0, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
      {tendrilGeometries.map((geom, i) => (
        <group key={i}>
          {/* Attachment node */}
          <mesh
            position={[geom.attachX, 0.05, geom.attachZ]}
            scale={0.07 + decay * 0.015}
            geometry={attachmentGeometry}
          >
            <primitive object={attachmentMaterial} attach="material" />
          </mesh>

          {/* Tendril tube - GPU-animated */}
          <mesh geometry={geom.tubeGeom}>
            <primitive object={tendrilMaterials[i]} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
};
