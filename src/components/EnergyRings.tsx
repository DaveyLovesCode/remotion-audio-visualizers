import { useMemo } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface EnergyRingsProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

/**
 * Concentric rings that expand outward on beats
 * Creates that classic EDM pulse wave effect
 */
export const EnergyRings: React.FC<EnergyRingsProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const time = frame / fps;

  const ringMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uBeatIntensity: { value: 0 },
        uEnergy: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uBass;
        uniform float uBeatIntensity;

        varying vec2 vUv;
        varying float vRadius;

        void main() {
          vUv = uv;

          vec3 pos = position;

          // Calculate radius from center
          vRadius = length(pos.xy);

          // Pulsing scale based on bass
          float scale = 1.0 + uBass * 0.15 + uBeatIntensity * 0.1;
          pos.xy *= scale;

          // Subtle wave distortion
          float wave = sin(vRadius * 3.0 - uTime * 2.0) * 0.05 * uBass;
          pos.z += wave;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uBass;
        uniform float uBeatIntensity;
        uniform float uEnergy;

        varying vec2 vUv;
        varying float vRadius;

        void main() {
          // Create ring pattern
          float ringWidth = 0.02;
          float ringSpacing = 0.15;

          // Multiple rings at different radii
          float ring1 = smoothstep(ringWidth, 0.0, abs(mod(vRadius, ringSpacing) - ringSpacing * 0.5));
          float ring2 = smoothstep(ringWidth * 0.5, 0.0, abs(mod(vRadius + 0.075, ringSpacing) - ringSpacing * 0.5));

          float rings = ring1 * 0.8 + ring2 * 0.4;

          // Fade out at edges
          float fadeOut = 1.0 - smoothstep(1.5, 3.0, vRadius);
          rings *= fadeOut;

          // Color
          vec3 color1 = vec3(1.0, 0.0, 0.8); // Magenta
          vec3 color2 = vec3(0.0, 0.8, 1.0); // Cyan

          float colorMix = sin(vRadius * 2.0 - uTime) * 0.5 + 0.5;
          vec3 color = mix(color1, color2, colorMix);

          // Intensity modulation
          float intensity = rings * (0.3 + uBass * 0.5 + uBeatIntensity * 0.4);
          color *= intensity;

          // Additive glow
          color += vec3(1.0) * uBeatIntensity * rings * 0.2;

          gl_FragColor = vec4(color, intensity * 0.6);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  // Update uniforms
  ringMaterial.uniforms.uTime.value = time;
  ringMaterial.uniforms.uBass.value = audioFrame.bass;
  ringMaterial.uniforms.uBeatIntensity.value = audioFrame.beatIntensity;
  ringMaterial.uniforms.uEnergy.value = audioFrame.energy;

  return (
    <mesh rotation={[-Math.PI / 2, 0, time * 0.05]}>
      <planeGeometry args={[8, 8, 64, 64]} />
      <primitive object={ringMaterial} attach="material" />
    </mesh>
  );
};
