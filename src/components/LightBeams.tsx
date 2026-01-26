import { useMemo } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface LightBeamsProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
  beamCount?: number;
}

/**
 * Volumetric light beams shooting from the center
 * Reactive to high frequencies and beats
 */
export const LightBeams: React.FC<LightBeamsProps> = ({
  frame,
  audioFrame,
  fps,
  beamCount = 12,
}) => {
  const time = frame / fps;

  const beams = useMemo(() => {
    return Array.from({ length: beamCount }, (_, i) => {
      const angle = (i / beamCount) * Math.PI * 2;
      const length = 6 + Math.random() * 2;
      const width = 0.08 + Math.random() * 0.06;
      const phaseOffset = Math.random() * Math.PI * 2;
      const freqBand = Math.floor(Math.random() * 3); // 0=bass, 1=mid, 2=high

      return { angle, length, width, phaseOffset, freqBand };
    });
  }, [beamCount]);

  const beamMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor: { value: new THREE.Color("#ff00ff") },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uColor;

        varying vec2 vUv;

        void main() {
          // Beam shape - fade at edges and tip
          float edgeFade = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
          float tipFade = smoothstep(1.0, 0.3, vUv.y);

          float alpha = edgeFade * tipFade * uIntensity;

          // Core glow
          float core = smoothstep(0.5, 0.2, abs(vUv.x - 0.5));
          vec3 color = uColor * (0.5 + core * 0.5);

          // Add white hot center
          color += vec3(1.0) * core * core * uIntensity;

          gl_FragColor = vec4(color, alpha * 0.7);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  return (
    <group>
      {beams.map((beam, i) => {
        // Get intensity based on frequency band
        let intensity: number;
        switch (beam.freqBand) {
          case 0:
            intensity = audioFrame.bass;
            break;
          case 1:
            intensity = audioFrame.mid;
            break;
          default:
            intensity = audioFrame.high;
        }

        // Pulsing animation
        const pulse = Math.sin(time * 3 + beam.phaseOffset) * 0.3 + 0.7;
        const finalIntensity = intensity * pulse * (0.5 + audioFrame.beatIntensity * 0.5);

        // Skip if too dim
        if (finalIntensity < 0.1) return null;

        // Clone material with unique intensity
        const mat = beamMaterial.clone();
        mat.uniforms.uTime.value = time;
        mat.uniforms.uIntensity.value = finalIntensity;

        // Color based on band
        const colors = ["#ff0080", "#8000ff", "#00ffff"];
        mat.uniforms.uColor.value = new THREE.Color(colors[beam.freqBand]);

        // Rotation animation
        const rotationZ = beam.angle + time * 0.1;

        return (
          <mesh
            key={i}
            position={[0, 0, 0]}
            rotation={[0, 0, rotationZ]}
          >
            <planeGeometry args={[beam.width, beam.length]} />
            <primitive object={mat} attach="material" />
          </mesh>
        );
      })}
    </group>
  );
};
