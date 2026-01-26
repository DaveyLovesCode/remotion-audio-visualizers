import { useMemo } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface JellyfishCoreProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

/**
 * INSANE jellyfish bell - contracts HARD on beats, shoots out spikes,
 * internal glow that PULSES, wild vertex displacement
 */
export const JellyfishCore: React.FC<JellyfishCoreProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;
  const bass = audioFrame.bass;

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDecay: { value: 0 },
        uDecayPhase: { value: 0 },
        uMid: { value: 0 },
        uBass: { value: 0 },
        uEnergy: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uDecayPhase;
        uniform float uMid;
        uniform float uBass;
        uniform float uEnergy;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying float vDisplacement;
        varying float vSpike;

        // Simplex noise
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
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
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
          vNormal = normal;
          vPosition = position;

          float verticalPos = position.y;
          float bellFactor = smoothstep(-1.0, 0.5, verticalPos);

          // AGGRESSIVE contraction on beats - squish the bell HARD
          float contraction = uDecay * uDecay * 0.5 * bellFactor;

          // WILD organic undulation - multiple octaves
          vec3 noisePos = position * 2.5;
          noisePos.x += uDecayPhase * 0.8;
          noisePos.z += uTime * 0.5;
          float undulation1 = snoise(noisePos) * 0.2;
          float undulation2 = snoise(noisePos * 2.0 + uTime) * 0.1;
          float undulation3 = snoise(noisePos * 4.0 - uDecayPhase) * 0.05;
          float undulation = (undulation1 + undulation2 + undulation3) * (1.0 + uMid * 1.5 + uDecay * 2.0);

          // SPIKES that shoot out on beats - noise-based selection
          float spikeNoise = snoise(position * 8.0 + uDecayPhase * 2.0);
          float spikeThreshold = 0.6 - uDecay * 0.3; // More spikes during beats
          float isSpike = smoothstep(spikeThreshold, spikeThreshold + 0.1, spikeNoise);
          float spikeLength = isSpike * uDecay * 0.8 * (0.5 + bellFactor * 0.5);
          vSpike = isSpike * uDecay;

          // Ripple waves traveling down - FASTER and more intense
          float ripple = sin(verticalPos * 12.0 - uTime * 6.0 - uDecayPhase * 4.0) * 0.08 * uDecay;
          float ripple2 = sin(verticalPos * 8.0 + uTime * 4.0) * 0.04 * uEnergy;

          // BREATHE - whole thing pulses
          float breathe = sin(uTime * 2.0) * 0.1 * (1.0 + uDecay);

          float displacement = -contraction + undulation + spikeLength + ripple + ripple2 + breathe;
          vDisplacement = displacement;

          vec3 newPosition = position + normal * displacement;

          // Flatten bottom for bell shape
          if (newPosition.y < -0.3) {
            newPosition.y = -0.3 - (newPosition.y + 0.3) * 0.3;
          }

          vWorldPosition = (modelMatrix * vec4(newPosition, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uDecayPhase;
        uniform float uBass;
        uniform float uEnergy;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying float vDisplacement;
        varying float vSpike;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);

          // INTENSE fresnel
          float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 3.5);

          float verticalGrad = smoothstep(-0.5, 0.5, vPosition.y);

          // VIVID colors that shift with audio
          vec3 coreColor = vec3(0.0, 0.6 + uDecay * 0.3, 0.5 + uBass * 0.3);
          vec3 rimColor = vec3(0.0, 0.4, 1.0);
          vec3 pulseColor = vec3(0.2 + uDecay * 0.8, 1.0, 0.7);
          vec3 spikeColor = vec3(1.0, 0.5, 1.0); // Hot pink spikes
          vec3 hotColor = vec3(1.0, 1.0, 1.0);

          vec3 color = mix(coreColor, rimColor, fresnel * 0.7);

          // INTENSE pulse glow
          float pulseIntensity = uDecay * uDecay * 1.5;
          color = mix(color, pulseColor, pulseIntensity * verticalGrad);

          // Spike glow - HOT
          color = mix(color, spikeColor, vSpike * 0.8);
          color = mix(color, hotColor, vSpike * vSpike * 0.5);

          // Rim light BLAZES on beats
          color += rimColor * fresnel * (0.6 + uDecay * 1.5);

          // Internal veins - FASTER, more visible
          float veinPattern = sin(vPosition.x * 20.0 + uTime * 4.0 + uDecayPhase * 2.0) *
                             sin(vPosition.y * 15.0 - uDecayPhase * 3.0) *
                             sin(vPosition.z * 18.0 + uTime * 3.0);
          veinPattern = smoothstep(0.5, 1.0, veinPattern);
          color += vec3(0.3, 1.0, 0.9) * veinPattern * (0.4 + uDecay * 0.6);

          // Electric arcs on high energy
          float arc = sin(vPosition.x * 50.0 + uTime * 20.0) * sin(vPosition.y * 40.0 - uTime * 15.0);
          arc = smoothstep(0.9, 1.0, arc) * uEnergy * uDecay;
          color += vec3(0.5, 1.0, 1.0) * arc * 2.0;

          // Alpha - more opaque when pulsing
          float alpha = 0.35 + fresnel * 0.5 + uDecay * 0.3 + vSpike * 0.3;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);

  shaderMaterial.uniforms.uTime.value = time;
  shaderMaterial.uniforms.uDecay.value = decay;
  shaderMaterial.uniforms.uDecayPhase.value = audioFrame.decayPhase ?? 0;
  shaderMaterial.uniforms.uMid.value = audioFrame.mid;
  shaderMaterial.uniforms.uBass.value = bass;
  shaderMaterial.uniforms.uEnergy.value = audioFrame.energy;

  // Rotation accelerates with decay
  const rotY = time * 0.2 + (audioFrame.decayPhase ?? 0) * 0.3;
  const rotX = Math.sin(time * 0.3) * 0.1;

  // Scale PUNCHES on beats
  const baseScale = 1.3;
  const beatPunch = 1 + decay * 0.25;

  return (
    <mesh rotation={[rotX, rotY, 0]} scale={baseScale * beatPunch}>
      <sphereGeometry args={[1, 80, 80]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
};
