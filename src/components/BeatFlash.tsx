import { useMemo } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface BeatFlashProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

/**
 * Full-screen flash effect on beat drops
 * Adds that concert strobe light feel
 */
export const BeatFlash: React.FC<BeatFlashProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const time = frame / fps;

  const flashMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uBeatIntensity: { value: 0 },
        uBass: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uBeatIntensity;
        uniform float uBass;
        uniform float uTime;

        varying vec2 vUv;

        void main() {
          // Only show on strong beats
          if (uBeatIntensity < 0.5) {
            discard;
          }

          // Flash intensity
          float intensity = uBeatIntensity * 0.4;

          // Radial gradient from center
          float dist = length(vUv - 0.5) * 2.0;
          float radial = 1.0 - smoothstep(0.0, 1.5, dist);

          // Color - white with slight color tint
          vec3 color = vec3(1.0);
          color = mix(color, vec3(1.0, 0.0, 0.8), sin(uTime * 10.0) * 0.2 + 0.2);
          color = mix(color, vec3(0.0, 1.0, 1.0), cos(uTime * 8.0) * 0.2 + 0.2);

          float alpha = intensity * radial;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
  }, []);

  // Update uniforms
  flashMaterial.uniforms.uBeatIntensity.value = audioFrame.beatIntensity;
  flashMaterial.uniforms.uBass.value = audioFrame.bass;
  flashMaterial.uniforms.uTime.value = time;

  // Only render if there's a beat
  if (audioFrame.beatIntensity < 0.3) {
    return null;
  }

  return (
    <mesh position={[0, 0, 5]}>
      <planeGeometry args={[20, 20]} />
      <primitive object={flashMaterial} attach="material" />
    </mesh>
  );
};
