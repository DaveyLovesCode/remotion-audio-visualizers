import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAudioTrigger } from "../audio";
import type { AudioFrame } from "../audio/types";

interface FloatingDebrisProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
  count?: number;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface DebrisItem {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  orbitSpeed: number;
  orbitRadius: number;
  orbitOffset: number;
  verticalSpeed: number;
  rotationSpeeds: [number, number, number];
  type: "tetra" | "octa" | "cube";
}

/**
 * Floating geometric debris orbiting the scene
 * Adds depth and movement to the composition
 */
export const FloatingDebris: React.FC<FloatingDebrisProps> = ({
  frame,
  audioFrame,
  fps,
  count = 30,
}) => {
  const time = frame / fps;

  // Multiple concurrent waves
  const MAX_WAVES = 6;
  const wavesRef = useRef<Array<{ originX: number; originY: number; startTime: number }>>([]);
  const lastTimeRef = useRef(-Infinity);

  // Remotion renders frames out of order - reset waves if time went backwards
  if (time < lastTimeRef.current - 0.05) {
    wavesRef.current = [];
  }
  lastTimeRef.current = time;

  // Rising-edge trigger using centralized hook
  const { justTriggered } = useAudioTrigger({
    value: audioFrame.bass,
    threshold: 0.5,
    time,
    decayDuration: 1.5,
  });

  if (justTriggered) {
    const angle = seededRandom(frame + 500) * Math.PI * 2;
    wavesRef.current.push({
      originX: Math.cos(angle),
      originY: Math.sin(angle),
      startTime: time,
    });
    if (wavesRef.current.length > MAX_WAVES) {
      wavesRef.current.shift();
    }
  }

  // Remove old waves OR future waves (Remotion out-of-order rendering)
  wavesRef.current = wavesRef.current.filter(
    w => w.startTime <= time && time - w.startTime < 1.5
  );

  // Generate debris items
  const debris = useMemo<DebrisItem[]>(() => {
    const items: DebrisItem[] = [];
    const types: DebrisItem["type"][] = ["tetra", "octa", "cube"];

    for (let i = 0; i < count; i++) {
      const orbitRadius = 4 + seededRandom(i * 7) * 6;
      const theta = seededRandom(i * 11) * Math.PI * 2;
      const phi = seededRandom(i * 13) * Math.PI;

      items.push({
        position: [
          orbitRadius * Math.sin(phi) * Math.cos(theta),
          (seededRandom(i * 17) - 0.5) * 6,
          orbitRadius * Math.sin(phi) * Math.sin(theta),
        ],
        rotation: [
          seededRandom(i * 19) * Math.PI * 2,
          seededRandom(i * 23) * Math.PI * 2,
          seededRandom(i * 29) * Math.PI * 2,
        ],
        scale: 0.05 + seededRandom(i * 31) * 0.15,
        orbitSpeed: 0.05 + seededRandom(i * 37) * 0.1,
        orbitRadius,
        orbitOffset: theta,
        verticalSpeed: 0.1 + seededRandom(i * 41) * 0.2,
        rotationSpeeds: [
          0.2 + seededRandom(i * 43) * 0.8,
          0.3 + seededRandom(i * 47) * 1.0,
          0.15 + seededRandom(i * 53) * 0.6,
        ],
        type: types[Math.floor(seededRandom(i * 59) * types.length)],
      });
    }

    return items;
  }, [count]);

  // Shader material for debris
  const debrisMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uWaveOpacity: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vDepth;

        void main() {
          vNormal = normal;
          vPosition = position;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uEnergy;
        uniform float uWaveOpacity;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vDepth;

        void main() {
          // Edge glow effect
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float edge = 1.0 - abs(dot(viewDir, vNormal));
          edge = pow(edge, 2.0);

          // Base color - dim purple
          vec3 colorBase = vec3(0.2, 0.0, 0.4);
          vec3 colorBright = vec3(0.8, 0.2, 1.0);

          // Glow color
          vec3 glowColor = mix(
            vec3(1.0, 0.0, 0.5),
            vec3(0.0, 1.0, 1.0),
            sin(uTime + vPosition.y) * 0.5 + 0.5
          );

          vec3 color = mix(colorBase, glowColor, edge * 0.6);
          // Wave brightens the geometry
          color = mix(color, colorBright, uWaveOpacity * 0.8);
          color *= 0.5 + uEnergy * 0.5;

          // Near-camera fade to avoid clipping artifacts
          float nearFade = smoothstep(1.5, 4.0, vDepth);

          // Base alpha + wave boost
          float baseAlpha = 0.25 + edge * 0.3;
          float alpha = (baseAlpha + uWaveOpacity * 0.6) * nearFade;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  // Update base uniforms
  debrisMaterial.uniforms.uTime.value = time;
  debrisMaterial.uniforms.uEnergy.value = audioFrame.energy;

  return (
    <group>
      {debris.map((item, i) => {
        // Animate position - steady time, no expansion
        const angle = item.orbitOffset + time * item.orbitSpeed;
        const x = Math.sin(angle) * item.orbitRadius;
        const z = Math.cos(angle) * item.orbitRadius;
        const y = item.position[1] + Math.sin(time * item.verticalSpeed + i) * 0.5;

        // Animate rotation with per-item speeds
        const rotX = item.rotation[0] + time * item.rotationSpeeds[0];
        const rotY = item.rotation[1] + time * item.rotationSpeeds[1];
        const rotZ = item.rotation[2] + time * item.rotationSpeeds[2];

        // Calculate wave opacity from all active waves (additive)
        let totalWaveOpacity = 0;
        for (const wave of wavesRef.current) {
          const waveTime = time - wave.startTime;
          const waveProgress = waveTime * 75;
          const wavePos = x * wave.originX + y * wave.originY;
          const frontDist = waveProgress - wavePos - 15;

          // Wave shape: fade in at front, long tail
          const leading = Math.max(0, Math.min(1, (frontDist + 3) / 4));
          const trailing = Math.max(0, Math.min(1, (12 - frontDist) / 12));
          totalWaveOpacity += leading * trailing;
        }
        totalWaveOpacity = Math.min(totalWaveOpacity, 1.5);

        // Size grows slightly with wave
        const scale = item.scale * (1 + totalWaveOpacity * 0.3);

        // Clone material for each item
        const mat = debrisMaterial.clone();
        mat.uniforms.uTime.value = time;
        mat.uniforms.uEnergy.value = audioFrame.energy;
        mat.uniforms.uWaveOpacity.value = totalWaveOpacity;

        let geometry;
        switch (item.type) {
          case "tetra":
            geometry = <tetrahedronGeometry args={[1, 0]} />;
            break;
          case "octa":
            geometry = <octahedronGeometry args={[1, 0]} />;
            break;
          default:
            geometry = <boxGeometry args={[1, 1, 1]} />;
        }

        return (
          <mesh
            key={i}
            position={[x, y, z]}
            rotation={[rotX, rotY, rotZ]}
            scale={scale}
          >
            {geometry}
            <primitive object={mat} attach="material" />
          </mesh>
        );
      })}
    </group>
  );
};
