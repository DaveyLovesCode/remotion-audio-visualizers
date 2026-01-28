import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface OceanSurfaceProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

/**
 * Ocean surface layer with sun, light beams, and murky depth
 * Positioned far above the jellyfish, creates atmospheric depth
 */
export const OceanSurface: React.FC<OceanSurfaceProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const time = frame / fps;
  const pulse = audioFrame.pulse ?? 0;

  const surfaceY = 22;
  const sunPosition = useMemo(() => new THREE.Vector3(5, surfaceY + 8, 3), []);

  // Water surface - animated waves with light transmission
  const surfaceMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uSunPos: { value: sunPosition },
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
          vUv = uv;

          // Gentle waves
          vec3 pos = position;
          float wave1 = sin(pos.x * 0.3 + uTime * 0.4) * cos(pos.z * 0.2 + uTime * 0.3) * 0.8;
          float wave2 = sin(pos.x * 0.7 + pos.z * 0.5 + uTime * 0.6) * 0.4;
          float wave3 = cos(pos.x * 0.15 - uTime * 0.2) * sin(pos.z * 0.12 + uTime * 0.25) * 1.2;
          pos.y += wave1 + wave2 + wave3;

          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

          // Compute normal from wave derivatives
          float dx = 0.3 * cos(pos.x * 0.3 + uTime * 0.4) * cos(pos.z * 0.2 + uTime * 0.3) * 0.8
                   + 0.7 * cos(pos.x * 0.7 + pos.z * 0.5 + uTime * 0.6) * 0.4
                   - 0.15 * sin(pos.x * 0.15 - uTime * 0.2) * sin(pos.z * 0.12 + uTime * 0.25) * 1.2;
          float dz = -0.2 * sin(pos.x * 0.3 + uTime * 0.4) * sin(pos.z * 0.2 + uTime * 0.3) * 0.8
                   + 0.5 * cos(pos.x * 0.7 + pos.z * 0.5 + uTime * 0.6) * 0.4
                   + 0.12 * cos(pos.x * 0.15 - uTime * 0.2) * cos(pos.z * 0.12 + uTime * 0.25) * 1.2;

          vNormal = normalize(vec3(-dx, 1.0, -dz));

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uPulse;
        uniform vec3 uSunPos;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
          // Direction to sun
          vec3 toSun = normalize(uSunPos - vWorldPos);

          // Fresnel - edges more reflective, center transmits light
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);

          // Light transmission where waves focus sunlight
          float transmission = pow(max(dot(vNormal, toSun), 0.0), 2.0);

          // Caustic-like bright spots from wave focusing
          float caustic = pow(max(dot(reflect(-toSun, vNormal), viewDir), 0.0), 8.0);

          // Base water color - deep blue-green
          vec3 deepColor = vec3(0.0, 0.04, 0.08);
          vec3 surfaceColor = vec3(0.02, 0.12, 0.18);
          vec3 sunColor = vec3(0.95, 0.9, 0.7);
          vec3 causticColor = vec3(0.6, 0.85, 0.9);

          // Blend based on view angle
          vec3 color = mix(deepColor, surfaceColor, fresnel * 0.6);

          // Add sun transmission glow
          color += sunColor * transmission * 0.15 * (1.0 + uPulse * 0.3);

          // Add caustic highlights
          color += causticColor * caustic * 0.4;

          // Shimmer from wave peaks
          float shimmer = sin(vWorldPos.x * 2.0 + vWorldPos.z * 1.5 + uTime * 2.0) * 0.5 + 0.5;
          shimmer *= transmission;
          color += vec3(0.15, 0.25, 0.3) * shimmer * 0.2;

          // Fade at edges
          float edgeFade = 1.0 - smoothstep(40.0, 75.0, length(vWorldPos.xz));

          float alpha = (0.275 + fresnel * 0.44 + transmission * 0.22) * edgeFade;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, [sunPosition]);

  surfaceMaterial.uniforms.uTime.value = time;
  surfaceMaterial.uniforms.uPulse.value = pulse;

  // God rays - volumetric light beams from surface, distributed all around
  const rayCount = 12;
  const rays = useMemo(() => {
    return Array.from({ length: rayCount }, (_, i) => {
      const angle = (i / rayCount) * Math.PI * 2;
      const radius = 8 + Math.sin(i * 2.7) * 6;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        width: 1.8 + Math.sin(i * 3.7) * 1.0,
        intensity: 0.6 + Math.sin(i * 1.9) * 0.3,
        phase: i * 1.7,
      };
    });
  }, []);

  const rayMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vWorldY;

        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldY = worldPos.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uPulse;

        varying vec2 vUv;
        varying float vWorldY;

        void main() {
          // Fade from top (bright) to bottom (dim)
          float verticalFade = smoothstep(-5.0, 20.0, vWorldY);

          // Fade at horizontal edges of beam
          float centerDist = abs(vUv.x - 0.5) * 2.0;
          float beamFade = 1.0 - pow(centerDist, 1.5);

          // Murky water scattering - particles in the beam
          float scatter = sin(vUv.y * 40.0 + uTime * 0.5) * 0.5 + 0.5;
          scatter *= sin(vUv.x * 20.0 + vUv.y * 15.0 - uTime * 0.3) * 0.5 + 0.5;
          scatter = scatter * 0.3 + 0.7;

          // Color - warm white from sun
          vec3 rayColor = vec3(0.85, 0.9, 0.75);
          vec3 scatterColor = vec3(0.4, 0.6, 0.7);
          vec3 color = mix(scatterColor, rayColor, verticalFade);

          // Audio reactivity - beams pulse brighter
          float intensity = 0.088 + uPulse * 0.066;

          float alpha = verticalFade * beamFade * scatter * intensity;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  rayMaterial.uniforms.uTime.value = time;
  rayMaterial.uniforms.uPulse.value = pulse;

  // Sun glow - bright disk visible through the murky water
  const sunMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
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
        uniform float uPulse;
        varying vec2 vUv;

        void main() {
          vec2 center = vUv - 0.5;
          float dist = length(center);

          // Core bright disk
          float core = smoothstep(0.3, 0.0, dist);

          // Outer glow
          float glow = smoothstep(0.5, 0.1, dist) * 0.6;

          // Shimmer
          float shimmer = sin(atan(center.y, center.x) * 8.0 + uTime * 0.5) * 0.5 + 0.5;
          shimmer *= smoothstep(0.4, 0.2, dist);

          // Warm sun color
          vec3 coreColor = vec3(1.0, 0.95, 0.8);
          vec3 glowColor = vec3(0.9, 0.7, 0.4);
          vec3 color = coreColor * core + glowColor * (glow + shimmer * 0.2);

          // Audio pulse
          color *= 1.0 + uPulse * 0.2;

          float alpha = core + glow * 0.8 + shimmer * 0.15;
          alpha *= 0.77; // Overall opacity - visible but not overwhelming

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  sunMaterial.uniforms.uTime.value = time;
  sunMaterial.uniforms.uPulse.value = pulse;

  // Murky depth fog - volumetric haze
  const fogMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uSunPos: { value: sunPosition },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec2 vUv;

        void main() {
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uPulse;
        uniform vec3 uSunPos;

        varying vec3 vWorldPos;
        varying vec2 vUv;

        void main() {
          // Murky blue-green water color
          vec3 fogColor = vec3(0.01, 0.06, 0.1);

          // Lighter towards the sun
          vec3 toSun = normalize(uSunPos - vWorldPos);
          float sunward = max(dot(vec3(0.0, 1.0, 0.0), toSun), 0.0);
          fogColor += vec3(0.02, 0.04, 0.03) * sunward;

          // Subtle particle drift
          float drift = sin(vWorldPos.x * 0.1 + vWorldPos.y * 0.05 + uTime * 0.1) * 0.5 + 0.5;
          drift *= sin(vWorldPos.z * 0.08 - uTime * 0.08) * 0.5 + 0.5;
          fogColor += vec3(0.01, 0.02, 0.025) * drift;

          // Vertical gradient - denser below
          float heightFade = smoothstep(-5.0, 18.0, vWorldPos.y);

          // Edge fade
          float edgeFade = 1.0 - smoothstep(35.0, 60.0, length(vWorldPos.xz));

          float alpha = (0.165 - heightFade * 0.11) * edgeFade;
          alpha += uPulse * 0.022; // Slightly denser on beats

          gl_FragColor = vec4(fogColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, [sunPosition]);

  fogMaterial.uniforms.uTime.value = time;
  fogMaterial.uniforms.uPulse.value = pulse;

  // Ray geometry - tall quads
  const rayGeometry = useMemo(() => {
    return new THREE.PlaneGeometry(1, 30, 1, 20);
  }, []);

  // Animated ray sway
  const rayGroupRef = useRef<THREE.Group>(null);

  return (
    <group>
      {/* Sun disk */}
      <mesh position={[sunPosition.x, sunPosition.y, sunPosition.z]}>
        <planeGeometry args={[12, 12]} />
        <primitive object={sunMaterial} attach="material" />
      </mesh>

      {/* Water surface - centered above the scene */}
      <mesh position={[0, surfaceY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[150, 150, 64, 64]} />
        <primitive object={surfaceMaterial} attach="material" />
      </mesh>

      {/* God rays */}
      <group ref={rayGroupRef}>
        {rays.map((ray, i) => {
          const sway = Math.sin(time * 0.2 + ray.phase) * 1.5;
          return (
            <mesh
              key={i}
              position={[ray.x + sway, surfaceY - 15, ray.z]}
              scale={[ray.width, 1, 1]}
            >
              <primitive object={rayGeometry} attach="geometry" />
              <primitive object={rayMaterial} attach="material" />
            </mesh>
          );
        })}
      </group>

      {/* Murky depth fog - horizontal layer covering the scene */}
      <mesh position={[0, 10, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[120, 120]} />
        <primitive object={fogMaterial} attach="material" />
      </mesh>

      {/* Lower fog layer */}
      <mesh position={[0, 4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <primitive object={fogMaterial} attach="material" />
      </mesh>

      {/* Ambient light from above - sun glow */}
      <pointLight
        position={[sunPosition.x, surfaceY, sunPosition.z]}
        intensity={0.88}
        color="#fffae0"
        distance={80}
        decay={1.5}
      />

      {/* Diffuse light from surface - centered */}
      <pointLight
        position={[0, surfaceY - 5, 0]}
        intensity={0.4}
        color="#4080a0"
        distance={60}
      />
    </group>
  );
};
