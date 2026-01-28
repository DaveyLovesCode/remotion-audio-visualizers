import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAudioTrigger } from "../audio";
import type { AudioFrame } from "../audio/types";

interface DomeRippleProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

const MAX_WAVES = 5;
const WAVE_DURATION = 0.5;

interface Wave {
  startTime: number;
  seed: number;
}

/**
 * Energy rings that flow from apex down the dome
 * Each ring is a displaced torus that follows the dome contour
 */
export const DomeRipple: React.FC<DomeRippleProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const time = frame / fps;

  const wavesRef = useRef<Wave[]>([]);
  const lastTimeRef = useRef(-Infinity);

  // Reset on time jump
  if (time < lastTimeRef.current - 0.05) {
    wavesRef.current = [];
  }
  lastTimeRef.current = time;

  // Trigger on bass
  const { justTriggered } = useAudioTrigger({
    value: audioFrame.bass,
    threshold: 0.35,
    time,
    decayDuration: WAVE_DURATION,
  });

  if (justTriggered) {
    const seed = Math.sin(time * 127.1 + 311.7) * 43758.5453;
    wavesRef.current.push({
      startTime: time,
      seed: seed - Math.floor(seed),
    });
    if (wavesRef.current.length > MAX_WAVES) {
      wavesRef.current.shift();
    }
  }

  // Remove expired
  wavesRef.current = wavesRef.current.filter(
    (w) => w.startTime <= time && time - w.startTime < WAVE_DURATION
  );

  return (
    <>
      {wavesRef.current.map((wave, i) => (
        <EnergyRing
          key={`${wave.startTime}-${i}`}
          time={time}
          waveTime={time - wave.startTime}
          seed={wave.seed}
          duration={WAVE_DURATION}
        />
      ))}
    </>
  );
};

interface EnergyRingProps {
  time: number;
  waveTime: number;
  seed: number;
  duration: number;
}

const EnergyRing: React.FC<EnergyRingProps> = ({
  time,
  waveTime,
  seed,
  duration,
}) => {
  // Progress 0-1
  const progress = Math.min(1, waveTime / duration);
  const eased = 1 - Math.pow(1 - progress, 1.5);

  // Dome radius - starts on dome, expands outward toward end
  const domeRadius = 1.05;
  const expansionFactor = 1 + eased * 0.8; // expands to 1.8x at the end
  const phi = eased * Math.PI * 0.55; // go slightly past equator

  // Ring position - follows dome then expands outward
  const ringRadius = domeRadius * Math.sin(phi) * expansionFactor;
  const ringY = domeRadius * Math.cos(phi) * (1 - eased * 0.3); // drops lower at end

  // Tube thickness - gets slightly thicker as it expands
  const tubeRadius = 0.03 + seed * 0.02 + eased * 0.02;

  // Fade out - more aggressive fade
  const opacity = (1 - eased * 0.5) * Math.pow(1 - progress, 2);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: seed },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uSeed;

        varying float vNoise;

        // Simple noise
        float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float noise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }

        void main() {
          // Displace vertices with noise for organic shape
          float angle = atan(position.y, position.x);
          float n = noise(vec3(angle * 3.0 + uSeed * 10.0, uTime * 5.0, uSeed * 20.0));
          float displacement = (n - 0.5) * 0.15;

          vec3 pos = position;
          pos.xy *= 1.0 + displacement;

          // Additional wobble
          float wobble = noise(vec3(angle * 5.0 + uSeed * 30.0, uTime * 8.0, 0.0));
          pos.z += (wobble - 0.5) * 0.04;

          vNoise = n;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        uniform float uSeed;

        varying float vNoise;

        void main() {
          // Bioluminescent energy colors - cyan/teal
          vec3 color1 = vec3(0.0, 0.6, 0.5);   // deep teal
          vec3 color2 = vec3(0.1, 0.8, 0.7);   // brighter cyan
          vec3 color3 = vec3(0.2, 0.5, 0.9);   // blue tint

          // Mix based on noise for variation
          vec3 color = mix(color1, color2, vNoise);
          color = mix(color, color3, uSeed * 0.3);

          // Slight glow boost
          color *= 1.2;

          gl_FragColor = vec4(color, uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }, [seed]);

  // Update uniforms
  material.uniforms.uTime.value = time;
  material.uniforms.uOpacity.value = opacity * 0.4; // more faint

  // Torus geometry - actual 3D ring
  const geometry = useMemo(() => {
    return new THREE.TorusGeometry(1, tubeRadius, 10, 64);
  }, [tubeRadius]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, ringY, 0]}
      scale={[ringRadius, ringRadius, ringRadius]}
      rotation={[Math.PI / 2, 0, seed * Math.PI * 2]}
    />
  );
};
