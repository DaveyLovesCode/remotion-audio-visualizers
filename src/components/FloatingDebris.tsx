import { useMemo } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface FloatingDebrisProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
  count?: number;
}

interface DebrisItem {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  orbitSpeed: number;
  orbitRadius: number;
  orbitOffset: number;
  verticalSpeed: number;
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

  // Generate debris items
  const debris = useMemo<DebrisItem[]>(() => {
    const items: DebrisItem[] = [];
    const types: DebrisItem["type"][] = ["tetra", "octa", "cube"];

    for (let i = 0; i < count; i++) {
      const orbitRadius = 4 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;

      items.push({
        position: [
          orbitRadius * Math.sin(phi) * Math.cos(theta),
          (Math.random() - 0.5) * 6,
          orbitRadius * Math.sin(phi) * Math.sin(theta),
        ],
        rotation: [
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
        ],
        scale: 0.05 + Math.random() * 0.15,
        orbitSpeed: 0.05 + Math.random() * 0.1,
        orbitRadius,
        orbitOffset: theta,
        verticalSpeed: 0.1 + Math.random() * 0.2,
        type: types[Math.floor(Math.random() * types.length)],
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
        uBeatIntensity: { value: 0 },
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
        uniform float uEnergy;
        uniform float uBeatIntensity;

        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          // Edge glow effect
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float edge = 1.0 - abs(dot(viewDir, vNormal));
          edge = pow(edge, 2.0);

          // Base color
          vec3 color = vec3(0.2, 0.0, 0.4);

          // Glow color
          vec3 glowColor = mix(
            vec3(1.0, 0.0, 0.5),
            vec3(0.0, 1.0, 1.0),
            sin(uTime + vPosition.y) * 0.5 + 0.5
          );

          color = mix(color, glowColor, edge * 0.8);
          color += glowColor * uBeatIntensity * 0.3;
          color *= 0.5 + uEnergy * 0.5;

          float alpha = 0.4 + edge * 0.4 + uBeatIntensity * 0.2;

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
  debrisMaterial.uniforms.uTime.value = time;
  debrisMaterial.uniforms.uEnergy.value = audioFrame.energy;
  debrisMaterial.uniforms.uBeatIntensity.value = audioFrame.beatIntensity;

  return (
    <group>
      {debris.map((item, i) => {
        // Animate position
        const angle = item.orbitOffset + time * item.orbitSpeed;
        const x = Math.sin(angle) * item.orbitRadius;
        const z = Math.cos(angle) * item.orbitRadius;
        const y = item.position[1] + Math.sin(time * item.verticalSpeed + i) * 0.5;

        // Animate rotation
        const rotX = item.rotation[0] + time * 0.3;
        const rotY = item.rotation[1] + time * 0.5;
        const rotZ = item.rotation[2] + time * 0.2;

        // Scale pulse on beats
        const scale = item.scale * (1 + audioFrame.beatIntensity * 0.3);

        // Clone material for each item
        const mat = debrisMaterial.clone();
        mat.uniforms.uTime.value = time;
        mat.uniforms.uEnergy.value = audioFrame.energy;
        mat.uniforms.uBeatIntensity.value = audioFrame.beatIntensity;

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
