import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface RefractionDomeProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

/**
 * Jellyfish dome with real refraction/distortion
 * Renders background to FBO, samples with distorted UVs for cloudy glass effect
 */
export const RefractionDome: React.FC<RefractionDomeProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const time = frame / fps;
  const pulse = audioFrame.pulse ?? 0;
  const { camera, size, scene, gl } = useThree();

  // FBO at 1/4 resolution - gives natural blur + massive perf win
  const fbo = useFBO(Math.floor(size.width / 4), Math.floor(size.height / 4), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });

  const meshRef = useRef<THREE.Mesh>(null);

  // Render scene (without dome) to FBO before main render
  useFrame(() => {
    if (!meshRef.current) return;

    // Hide dome, render scene to FBO
    meshRef.current.visible = false;
    gl.setRenderTarget(fbo);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    meshRef.current.visible = true;
  }, -1); // Priority -1 = runs before default render

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uPulsePhase: { value: 0 },
        uBass: { value: 0 },
        uBackgroundTexture: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPulse;
        uniform float uPulsePhase;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying vec3 vViewDir;
        varying vec4 vScreenPos;
        varying float vDisplacement;

        // Simplex noise for organic displacement
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
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;

          float verticalPos = position.y;
          float bellFactor = smoothstep(-1.0, 0.5, verticalPos);

          // Expansion on beats
          float expansion = uPulse * 0.12 * bellFactor;

          // Organic undulation
          vec3 noisePos = position * 2.0;
          noisePos.x += uPulsePhase * 0.4;
          float undulationBase = snoise(noisePos + uTime * 0.3) * 0.12;
          undulationBase += snoise(noisePos * 1.5 + uTime * 0.5) * 0.06;
          float undulation = undulationBase * (0.15 + uPulse * 0.75);

          // Ripple waves
          float ripple = sin(verticalPos * 8.0 - uTime * 3.0 - uPulsePhase * 2.0) * 0.015 * uPulse;

          // Breathing
          float breathe = sin(uTime * 1.5) * 0.03 * (0.3 + uPulse * 0.5);

          float displacement = expansion + undulation + ripple + breathe;
          vDisplacement = displacement;

          vec3 newPosition = position + normal * displacement;

          // Flatten bottom
          float flattenStart = -0.2;
          float flattenFull = -0.4;
          float flattenFactor = smoothstep(flattenStart, flattenFull, newPosition.y);
          float flattenedY = flattenStart - (newPosition.y - flattenStart) * 0.3;
          newPosition.y = mix(newPosition.y, flattenedY, flattenFactor);

          vWorldPosition = (modelMatrix * vec4(newPosition, 1.0)).xyz;
          vViewDir = normalize(cameraPosition - vWorldPosition);

          vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
          vScreenPos = projectionMatrix * mvPosition;

          gl_Position = vScreenPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uPulse;
        uniform float uPulsePhase;
        uniform float uBass;
        uniform sampler2D uBackgroundTexture;
        uniform vec2 uResolution;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        varying vec3 vViewDir;
        varying vec4 vScreenPos;
        varying float vDisplacement;

        float hash3(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }

        // 3D noise for volumetric distortion
        float noise3D(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);

          return mix(
            mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x),
                mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
            f.z
          );
        }

        void main() {
          // Screen UV from clip space
          vec2 screenUV = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;

          // Fresnel - stronger at edges
          float fresnel = pow(1.0 - abs(dot(vViewDir, vNormal)), 2.5);

          // === REFRACTION/DISTORTION ===

          // Base refraction from normal (like real glass)
          float ior = 1.04;
          vec3 refractDir = refract(-vViewDir, vNormal, 1.0 / ior);
          vec2 normalDistort = refractDir.xy * 0.055;

          // Volumetric cloudiness - single noise sample
          vec3 cloudPos = vWorldPosition * 2.2 + vec3(uTime * 0.12, uTime * 0.09, uTime * 0.1);
          float cloudNoise = noise3D(cloudPos);

          // Flowing distortion
          vec2 flowDistort = vec2(
            sin(cloudPos.x * 1.7 + cloudPos.z + uTime * 0.25) * 0.45 + cloudNoise - 0.5,
            cos(cloudPos.y * 1.7 + cloudPos.x + uTime * 0.2) * 0.45 + cloudNoise - 0.5
          ) * 0.07;

          // Pulse-reactive warping
          float pulseWarp = uPulse * 0.04;
          vec2 pulseDistort = vec2(
            sin(vPosition.x * 5.0 + uPulsePhase * 3.0),
            cos(vPosition.y * 5.0 + uPulsePhase * 2.0)
          ) * pulseWarp;

          // Combine distortions - stronger toward center, weaker at edges
          float centerFactor = 1.0 - fresnel * 0.7;
          vec2 totalDistort = (normalDistort + flowDistort + pulseDistort) * centerFactor;

          // Single sample - low-res FBO provides natural blur
          vec2 sampleUV = clamp(screenUV + totalDistort, 0.001, 0.999);
          vec3 bgColor = texture2D(uBackgroundTexture, sampleUV).rgb;

          // === INTERIOR MATTER/CLOUDINESS ===
          // Volumetric clouds inside the dome
          float interiorDensity = smoothstep(0.35, 0.65, cloudNoise);

          // Depth-based - more cloudy toward center
          float depth = 1.0 - fresnel;
          interiorDensity *= depth * 0.7 + 0.3;

          // Interior cloud color - bioluminescent
          vec3 cloudColorDeep = vec3(0.0, 0.15, 0.12);
          vec3 cloudColorLight = vec3(0.05, 0.35, 0.3);
          vec3 cloudColor = mix(cloudColorDeep, cloudColorLight, cloudNoise);

          // Mix cloud into the refracted view
          bgColor = mix(bgColor, cloudColor, interiorDensity * 0.5);

          // === JELLYFISH GLOW/SURFACE ===
          float verticalGrad = smoothstep(-0.5, 0.5, vPosition.y);

          vec3 coreColor = vec3(0.0, 0.5, 0.4);
          vec3 rimColor = vec3(0.0, 0.4, 0.8);
          vec3 pulseColor = vec3(0.1, 0.9, 0.7);

          vec3 surfaceColor = mix(coreColor, rimColor, fresnel * 0.6);
          float pulseIntensity = uPulse * 0.8;
          surfaceColor = mix(surfaceColor, pulseColor, pulseIntensity * verticalGrad);

          // Rim light
          surfaceColor += rimColor * fresnel * (0.32 + uPulse * 0.45);

          // Internal veins
          float veinPattern = sin(vPosition.x * 15.0 + uTime * 2.0 + uPulsePhase) *
                             sin(vPosition.y * 12.0 - uPulsePhase * 1.5) *
                             sin(vPosition.z * 14.0 + uTime * 1.5);
          veinPattern = smoothstep(0.6, 1.0, veinPattern);
          surfaceColor += vec3(0.2, 0.8, 0.7) * veinPattern * (0.2 + uPulse * 0.3);

          // === FINAL COMPOSITE ===
          // Blend refracted background with jellyfish surface
          // More surface color at edges (fresnel), more refraction at center
          float surfaceOpacity = fresnel * 0.6 + 0.15 + uPulse * 0.1;

          vec3 finalColor = mix(bgColor, surfaceColor, surfaceOpacity);

          // Add glow on top
          finalColor += surfaceColor * fresnel * 0.3;

          // Subtle iridescence
          float iridescence = sin(fresnel * 5.0 + uTime * 0.4) * 0.07;
          finalColor += vec3(0.09, 0.0, 0.12) * iridescence * fresnel;

          // Alpha - solid but with depth
          float alpha = 0.85 + fresnel * 0.15;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
  }, []);

  // Update uniforms
  shaderMaterial.uniforms.uTime.value = time;
  shaderMaterial.uniforms.uPulse.value = pulse;
  shaderMaterial.uniforms.uPulsePhase.value = audioFrame.pulsePhase ?? 0;
  shaderMaterial.uniforms.uBass.value = audioFrame.bass;
  shaderMaterial.uniforms.uBackgroundTexture.value = fbo.texture;
  shaderMaterial.uniforms.uResolution.value.set(size.width, size.height);

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 96, 96, Math.PI]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
};
