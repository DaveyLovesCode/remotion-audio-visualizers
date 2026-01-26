import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAudioTrigger } from "../audio";
import type { AudioFrame } from "../audio/types";

interface OrbitingShardsProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
  count?: number;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface Shard {
  orbitRadius: number;
  orbitSpeed: number;
  orbitOffset: number;
  orbitTilt: number;
  verticalOffset: number;
  scale: [number, number, number];
  rotationSpeeds: [number, number, number];
  initialRotation: [number, number, number];
  shapeType: "box" | "tetra" | "octa";
}

/**
 * Large angular shards orbiting the void
 * Fracture apart on beats, reassemble with decay
 */
export const OrbitingShards: React.FC<OrbitingShardsProps> = ({
  frame,
  audioFrame,
  fps,
  count = 24,
}) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;
  const decayPhase = audioFrame.decayPhase ?? 0;

  // Beat tracking for fracture effect
  const fractureRef = useRef(0);
  const lastTimeRef = useRef(-Infinity);

  // Remotion renders frames out of order - reset if time went backwards
  if (time < lastTimeRef.current - 0.05) {
    fractureRef.current = 0;
  }
  lastTimeRef.current = time;

  const { justTriggered } = useAudioTrigger({
    value: audioFrame.bass,
    threshold: 0.5,
    time,
    decayDuration: 0.5,
  });

  if (justTriggered) {
    fractureRef.current = 1;
  }

  // Decay fracture
  fractureRef.current *= 0.92;
  const fracture = fractureRef.current;

  // Generate shard configurations
  const shards = useMemo<Shard[]>(() => {
    const items: Shard[] = [];
    const shapes: Shard["shapeType"][] = ["box", "tetra", "octa"];

    for (let i = 0; i < count; i++) {
      const layer = Math.floor(i / 8); // 3 orbital layers
      const baseRadius = 2.5 + layer * 1.5;

      items.push({
        orbitRadius: baseRadius + seededRandom(i * 7) * 0.8,
        orbitSpeed: 0.15 + seededRandom(i * 11) * 0.2 * (layer % 2 === 0 ? 1 : -1),
        orbitOffset: seededRandom(i * 13) * Math.PI * 2,
        orbitTilt: (seededRandom(i * 17) - 0.5) * 0.5,
        verticalOffset: (seededRandom(i * 19) - 0.5) * 3,
        scale: [
          0.15 + seededRandom(i * 23) * 0.25,
          0.3 + seededRandom(i * 29) * 0.5,
          0.1 + seededRandom(i * 31) * 0.15,
        ],
        rotationSpeeds: [
          0.5 + seededRandom(i * 37) * 1.5,
          0.3 + seededRandom(i * 41) * 1.0,
          0.4 + seededRandom(i * 43) * 0.8,
        ],
        initialRotation: [
          seededRandom(i * 47) * Math.PI * 2,
          seededRandom(i * 53) * Math.PI * 2,
          seededRandom(i * 59) * Math.PI * 2,
        ],
        shapeType: shapes[Math.floor(seededRandom(i * 61) * shapes.length)],
      });
    }

    return items;
  }, [count]);

  // Shader material for shards
  const shardMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDecay: { value: 0 },
        uFracture: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;

        void main() {
          vNormal = normalMatrix * normal;
          vPosition = position;
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uFracture;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);

          // Hard edge lighting
          float edge = 1.0 - abs(dot(viewDir, vNormal));
          edge = pow(edge, 2.0);

          // Stark black/white base
          vec3 darkColor = vec3(0.02);
          vec3 lightColor = vec3(0.9);

          // Neon accents
          vec3 cyan = vec3(0.0, 1.0, 1.0);
          vec3 magenta = vec3(1.0, 0.0, 1.0);

          // Base color - mostly dark with bright edges
          vec3 color = mix(darkColor, lightColor, edge * 0.6);

          // Neon edge glow on beats
          float colorSelect = sin(vPosition.y * 3.0 + uTime);
          vec3 neonColor = mix(cyan, magenta, colorSelect * 0.5 + 0.5);
          color += neonColor * edge * uDecay * 1.5;

          // Fracture glow - white hot when fracturing
          color = mix(color, vec3(1.0), uFracture * edge * 0.8);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });
  }, []);

  shardMaterial.uniforms.uTime.value = time;
  shardMaterial.uniforms.uDecay.value = decay;
  shardMaterial.uniforms.uFracture.value = fracture;

  return (
    <group>
      {shards.map((shard, i) => {
        // Orbit position - accelerate on beats
        const angle = shard.orbitOffset + time * shard.orbitSpeed * (1 + decay * 2);

        // Base position
        let x = Math.sin(angle) * shard.orbitRadius;
        let z = Math.cos(angle) * shard.orbitRadius;
        let y = shard.verticalOffset + Math.sin(angle * 0.5 + shard.orbitTilt) * 0.5;

        // Apply tilt to orbit
        const tiltedY = y * Math.cos(shard.orbitTilt) - z * Math.sin(shard.orbitTilt);
        const tiltedZ = y * Math.sin(shard.orbitTilt) + z * Math.cos(shard.orbitTilt);

        // Fracture explosion - push outward
        const fractureDir = new THREE.Vector3(x, tiltedY, tiltedZ).normalize();
        const fractureDistance = fracture * 2.0;
        x += fractureDir.x * fractureDistance;
        const finalY = tiltedY + fractureDir.y * fractureDistance;
        const finalZ = tiltedZ + fractureDir.z * fractureDistance;

        // Rotation - accelerate on beats and during fracture
        const rotMultiplier = 1 + decay * 3 + fracture * 5;
        const rotX = shard.initialRotation[0] + time * shard.rotationSpeeds[0] * rotMultiplier;
        const rotY = shard.initialRotation[1] + time * shard.rotationSpeeds[1] * rotMultiplier;
        const rotZ = shard.initialRotation[2] + time * shard.rotationSpeeds[2] * rotMultiplier;

        // Scale - slight pulse on beats
        const scaleMultiplier = 1 + decay * 0.2 + fracture * 0.3;

        const mat = shardMaterial.clone();
        mat.uniforms.uTime.value = time;
        mat.uniforms.uDecay.value = decay;
        mat.uniforms.uFracture.value = fracture;

        let geometry;
        switch (shard.shapeType) {
          case "tetra":
            geometry = <tetrahedronGeometry args={[1, 0]} />;
            break;
          case "octa":
            geometry = <octahedronGeometry args={[1, 0]} />;
            break;
          default:
            geometry = <boxGeometry args={[1, 2, 0.5]} />;
        }

        return (
          <mesh
            key={i}
            position={[x, finalY, finalZ]}
            rotation={[rotX, rotY, rotZ]}
            scale={[
              shard.scale[0] * scaleMultiplier,
              shard.scale[1] * scaleMultiplier,
              shard.scale[2] * scaleMultiplier,
            ]}
          >
            {geometry}
            <primitive object={mat} attach="material" />
          </mesh>
        );
      })}
    </group>
  );
};
