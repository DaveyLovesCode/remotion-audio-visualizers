import { useMemo } from "react";
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

          // Base water color - brighter blue-green
          vec3 deepColor = vec3(0.01, 0.06, 0.12);
          vec3 surfaceColor = vec3(0.04, 0.18, 0.26);
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

          float alpha = (0.35 + fresnel * 0.5 + transmission * 0.28) * edgeFade;

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

  // God rays - clustered groups, all angled towards sun
  const rays = useMemo(() => {
    // Consistent tilt towards sun
    const tiltX = -0.04;
    const tiltZ = 0.06;

    const seededRandom = (seed: number) => {
      const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return x - Math.floor(x);
    };

    const allRays: {
      x: number;
      z: number;
      topWidth: number;
      length: number;
      tiltX: number;
      tiltZ: number;
      phase: number;
      brightness: number;
    }[] = [];

    // Define cluster centers - tight clumps with many rays
    const clusters = [
      { cx: 1, cz: 0, count: 12, spread: 1.5 },   // Main center cluster
      { cx: 4, cz: 2, count: 10, spread: 1.2 },   // Near sun
      { cx: -3, cz: -2, count: 10, spread: 1.3 }, // Left front
      { cx: -2, cz: 4, count: 8, spread: 1.2 },   // Left back
      { cx: 5, cz: -3, count: 8, spread: 1.0 },   // Right front
      { cx: -5, cz: 1, count: 7, spread: 1.0 },   // Far left
      { cx: 2, cz: -5, count: 7, spread: 1.0 },   // Front
      { cx: 0, cz: 5, count: 6, spread: 1.0 },    // Back
    ];

    let seed = 0;
    clusters.forEach((cluster) => {
      for (let i = 0; i < cluster.count; i++) {
        seed++;
        // Position within cluster
        const offsetX = (seededRandom(seed * 7) - 0.5) * cluster.spread * 2;
        const offsetZ = (seededRandom(seed * 11) - 0.5) * cluster.spread * 2;

        const x = cluster.cx + offsetX;
        const z = cluster.cz + offsetZ;

        // Lengths (12-22 units)
        const length = 12 + seededRandom(seed * 17) * 10;

        // Wider beams (2.5-5.0)
        const topWidth = 2.5 + seededRandom(seed * 23) * 2.5;

        // Brightness
        const brightness = 0.7 + seededRandom(seed * 31) * 0.3;

        allRays.push({
          x,
          z,
          topWidth,
          length,
          tiltX,
          tiltZ,
          phase: seededRandom(seed * 37) * 10,
          brightness,
        });
      }
    });

    return allRays;
  }, []);

  // Ray material - plane that tapers to point via shader
  const rayMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uBrightness: { value: 1.0 },
        uLength: { value: 1.0 },
      },
      vertexShader: `
        uniform float uLength;

        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          vUv = uv;

          // Taper: narrow at bottom (uv.y=0), wide at top (uv.y=1)
          float taper = uv.y;
          vec3 pos = position;
          pos.x *= taper;

          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uPulse;
        uniform float uBrightness;

        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          // t: 0 at top, 1 at bottom tip
          float t = 1.0 - vUv.y;

          // Vertical fade - bright at top, fades to point
          float verticalFade = pow(1.0 - t, 0.8);

          // Soft tip fade
          float tipFade = smoothstep(0.0, 0.2, 1.0 - t);

          // Horizontal fade from center - works with tapered geometry
          float centerDist = abs(vUv.x - 0.5) * 2.0;
          float horizFade = 1.0 - smoothstep(0.6, 1.0, centerDist);

          // Murky scattering
          float scatter = sin(vWorldPos.y * 0.6 + uTime * 0.3) * 0.3 + 0.7;

          // Color gradient
          vec3 topColor = vec3(1.0, 0.95, 0.7);
          vec3 bottomColor = vec3(0.4, 0.6, 0.65);
          vec3 color = mix(topColor, bottomColor, pow(t, 0.5));

          float intensity = (0.6 + uPulse * 0.2) * uBrightness;
          float alpha = verticalFade * tipFade * horizFade * scatter * intensity;

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

  // Create materials for each ray (geometry is simple plane)
  const rayMeshData = useMemo(() => {
    return rays.map((ray) => {
      const mat = rayMaterial.clone();
      mat.uniforms.uLength.value = ray.length;
      return { material: mat, ray };
    });
  }, [rays, rayMaterial]);

  // Update materials each frame
  rayMeshData.forEach(({ material, ray }) => {
    material.uniforms.uTime.value = time;
    material.uniforms.uPulse.value = pulse;
    material.uniforms.uBrightness.value = ray.brightness;
  });

  return (
    <group>
      {/* Sun disk */}
      <mesh position={[sunPosition.x, sunPosition.y, sunPosition.z]}>
        <planeGeometry args={[12, 12]} />
        <primitive object={sunMaterial} attach="material" />
      </mesh>

      {/* Water surface - centered above the scene */}
      <mesh position={[0, surfaceY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[150, 150, 128, 128]} />
        <primitive object={surfaceMaterial} attach="material" />
      </mesh>

      {/* God rays - planes that taper to points */}
      <group>
        {rayMeshData.map(({ material, ray }, i) => {
          // Organic sway
          const swayX = Math.sin(time * 0.15 + ray.phase) * 0.8;
          const swayZ = Math.cos(time * 0.12 + ray.phase * 0.7) * 0.6;

          return (
            <mesh
              key={i}
              position={[ray.x + swayX, surfaceY - ray.length / 2, ray.z + swayZ]}
              rotation={[ray.tiltX, 0, ray.tiltZ]}
              frustumCulled={false}
            >
              <planeGeometry args={[ray.topWidth, ray.length, 1, 16]} />
              <primitive object={material} attach="material" />
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
