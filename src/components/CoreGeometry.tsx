import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface CoreGeometryProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

/**
 * Central icosahedron that pulses and distorts with the bass/kick
 * Uses vertex displacement driven by noise + audio reactivity
 */
export const CoreGeometry: React.FC<CoreGeometryProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const time = frame / fps;

  // Create custom shader material for displacement
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uEnergy: { value: 0 },
        uBeatIntensity: { value: 0 },
        uDecay: { value: 0 },
        uDecayPhase: { value: 0 },
        uBaseColor: { value: new THREE.Color("#1a0a2e") },
        uGlowColor: { value: new THREE.Color("#ff00ff") },
        uHighlightColor: { value: new THREE.Color("#00ffff") },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uBass;
        uniform float uMid;
        uniform float uEnergy;
        uniform float uBeatIntensity;
        uniform float uDecay;
        uniform float uDecayPhase;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vDisplacement;

        // Simplex noise functions
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);

          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);

          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;

          i = mod289(i);
          vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;

          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);

          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);

          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);

          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));

          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);

          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;

          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
          vNormal = normal;
          vPosition = position;

          // Calculate angular position for peak evolution
          float angle = atan(position.y, position.x);
          float polarAngle = atan(length(position.xy), position.z);

          // Multi-octave noise with decayPhase offset for peak evolution
          // As decay accumulates, peaks rotate around the surface
          float noiseScale = 1.5;
          vec3 evolvedPos = position;
          evolvedPos.x = position.x * cos(uDecayPhase * 0.5) - position.y * sin(uDecayPhase * 0.5);
          evolvedPos.y = position.x * sin(uDecayPhase * 0.5) + position.y * cos(uDecayPhase * 0.5);

          float noise1 = snoise(evolvedPos * noiseScale + uTime * 0.3);
          float noise2 = snoise(evolvedPos * noiseScale * 2.0 + uTime * 0.5) * 0.5;
          float noise3 = snoise(evolvedPos * noiseScale * 4.0 + uTime * 0.7) * 0.25;
          float combinedNoise = noise1 + noise2 + noise3;

          // Sharpen peaks: raise noise to power to create more defined peaks vs valleys
          float sharpNoise = sign(combinedNoise) * pow(abs(combinedNoise), 0.7);

          // Decay-driven peak displacement - peaks get taller with decay
          // Use sharpened noise so peaks are more pronounced
          float peakDisplacement = uDecay * 0.9 * (0.3 + sharpNoise * 0.7);

          // Small base scale effect (reduced from before)
          float baseDisplacement = uDecay * 0.15;

          // Mid-frequency shimmer
          float midDisplacement = uMid * 0.15 * noise2;

          // Total displacement - mostly peaks, small uniform expansion
          float displacement = baseDisplacement + peakDisplacement + midDisplacement;
          displacement *= 1.0 + uEnergy * 0.3;

          vDisplacement = displacement;

          // Apply displacement along normal
          vec3 newPosition = position + normal * displacement;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uBass;
        uniform float uEnergy;
        uniform float uBeatIntensity;
        uniform float uDecay;
        uniform float uDecayPhase;
        uniform vec3 uBaseColor;
        uniform vec3 uGlowColor;
        uniform vec3 uHighlightColor;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vDisplacement;

        void main() {
          vec3 viewDirection = normalize(cameraPosition - vPosition);

          // Fresnel - rim light
          float fresnel = pow(1.0 - abs(dot(viewDirection, vNormal)), 2.5);

          // Continuous height gradient (not binary)
          // This drives everything - the higher, the more glow
          float height = vDisplacement; // Raw displacement
          float heightNorm = smoothstep(-0.05, 0.6, height); // Normalized 0-1
          float heightPow = pow(heightNorm, 1.5); // Emphasize the peaks more

          // Valley detection for darkening
          float isValley = smoothstep(0.08, 0.0, height);

          // === COLOR GRADIENT ===
          // Deep valleys: dark purple
          // Mid areas: base purple
          // Peaks: glow color
          // Tips: bright highlight
          vec3 valleyColor = uBaseColor * 0.25;
          vec3 midColor = uBaseColor * 0.55;
          vec3 peakColor = mix(uBaseColor, uGlowColor, 0.6);
          vec3 tipColor = vec3(1.0, 0.4, 0.7); // Hot pink

          // Build the gradient based on height
          vec3 color;
          if (heightNorm < 0.3) {
            // Valley to mid
            color = mix(valleyColor, midColor, heightNorm / 0.3);
          } else if (heightNorm < 0.7) {
            // Mid to peak glow
            float t = (heightNorm - 0.3) / 0.4;
            color = mix(midColor, peakColor, t);
          } else {
            // Peak to bright tip
            float t = (heightNorm - 0.7) / 0.3;
            color = mix(peakColor, tipColor, t);
          }

          // === RIM LIGHT (always on) ===
          color += uGlowColor * fresnel * 0.35;

          // === REACTIVE INTENSIFICATION (beats) ===
          // Everything intensifies with decay, but scaled by height
          // Valleys darken
          color *= (1.0 - isValley * uDecay * 0.5);

          // Peaks get brighter - additive glow scaled by height
          vec3 reactiveGlow = mix(uGlowColor, uHighlightColor, heightPow);
          color += reactiveGlow * heightPow * uDecay * 0.6;

          // Tips get extra hot pink
          float tipBoost = smoothstep(0.5, 0.8, heightNorm) * uDecay;
          color += vec3(1.0, 0.5, 0.75) * tipBoost * 0.5;

          // Fresnel intensifies on beats
          color += uGlowColor * fresnel * uDecay * 0.2;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      transparent: false,
      side: THREE.DoubleSide,
    });
  }, []);

  // Update uniforms every frame
  shaderMaterial.uniforms.uTime.value = time;
  shaderMaterial.uniforms.uBass.value = audioFrame.bass;
  shaderMaterial.uniforms.uMid.value = audioFrame.mid;
  shaderMaterial.uniforms.uEnergy.value = audioFrame.energy;
  shaderMaterial.uniforms.uBeatIntensity.value = audioFrame.beatIntensity;
  shaderMaterial.uniforms.uDecay.value = audioFrame.decay;
  shaderMaterial.uniforms.uDecayPhase.value = audioFrame.decayPhase;

  // Slow rotation
  const rotationY = time * 0.2;
  const rotationX = time * 0.1;

  // Minimal scale effect - most reactivity is in shader peaks
  const baseScale = 1.5;
  const beatScale = 1 + (audioFrame.decay ?? 0) * 0.075;

  return (
    <mesh
      ref={meshRef}
      rotation={[rotationX, rotationY, 0]}
      scale={baseScale * beatScale}
    >
      <icosahedronGeometry args={[1, 64]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
};
