import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface OceanEnvironmentProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Ocean environment - jellyfish ripping through the deep sea
 * Floor scrolls beneath, particles rush past, seaweed sways
 * Everything oriented relative to jellyfish swim direction (-Z)
 */
export const OceanEnvironment: React.FC<OceanEnvironmentProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;

  // THROTTLE - unified speed control
  // decay acts as the gas pedal: high decay = RIPPING, low decay = cruising
  const travelRef = useRef(0);
  const lastTimeRef = useRef(0);

  // SUPERSONIC base speed + massive boost on beats
  const baseSpeed = 12.0;
  const boostSpeed = 35.0;

  // Detect loop/seek - if time goes backwards, reset to deterministic base
  if (time < lastTimeRef.current - 0.05) {
    travelRef.current = time * baseSpeed;
  }

  const deltaTime = Math.min(time - lastTimeRef.current, 0.1);
  if (deltaTime > 0) {
    const throttle = baseSpeed + decay * boostSpeed;
    travelRef.current += throttle * deltaTime;
  }
  lastTimeRef.current = time;
  const travel = travelRef.current;

  // Rushing particles - RIPPING past, loop where invisible
  const particleCount = 600;
  const particleLoopLength = 80;
  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => ({
      x: (seededRandom(i * 3) - 0.5) * 16,
      y: seededRandom(i * 5) * 6 - 2,
      zOffset: (i / particleCount) * particleLoopLength + seededRandom(i * 7) * 3,
      size: 0.02 + seededRandom(i * 11) * 0.04,
      brightness: 0.5 + seededRandom(i * 13) * 0.5,
    }));
  }, []);

  // Particle shader
  const particleMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uDecay: { value: 0 },
      },
      vertexShader: `
        varying float vBrightness;
        attribute float brightness;

        void main() {
          vBrightness = brightness;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 3.0 * (50.0 / -mvPosition.z);
          gl_PointSize = clamp(gl_PointSize, 1.0, 8.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uDecay;
        varying float vBrightness;

        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;

          // Brighter and more visible during beats
          float intensity = 0.6 + uDecay * 0.6;
          float alpha = smoothstep(0.5, 0.1, dist) * vBrightness * intensity;
          vec3 color = vec3(0.4, 0.9, 1.0) * vBrightness * (1.0 + uDecay * 0.5);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);

  particleMaterial.uniforms.uDecay.value = decay;

  // Particle geometry
  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const brightnesses = new Float32Array(particleCount);

    particles.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = 0;
      brightnesses[i] = p.brightness;
    });

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("brightness", new THREE.BufferAttribute(brightnesses, 1));
    return geometry;
  }, [particles]);

  // Particles RIPPING toward the camera - uses unified throttle
  const positionAttr = particleGeometry.attributes.position as THREE.BufferAttribute;
  particles.forEach((p, i) => {
    let z = ((p.zOffset + travel) % particleLoopLength);
    z = z - 65; // Range: -65 to +15, pop happens far away
    positionAttr.setZ(i, z);
  });
  positionAttr.needsUpdate = true;

  // Speed streaks - motion blur lines RIPPING past
  const streakCount = 80;
  const streakLoopLength = 80;
  const streaks = useMemo(() => {
    return Array.from({ length: streakCount }, (_, i) => ({
      x: (seededRandom(i * 17) - 0.5) * 14,
      y: seededRandom(i * 19) * 5 - 1.5,
      zOffset: (i / streakCount) * streakLoopLength + seededRandom(i * 23) * 3,
      length: 1.5 + seededRandom(i * 29) * 3,
    }));
  }, []);

  const streakMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uDecay: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uDecay;
        varying vec2 vUv;

        void main() {
          float fade = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
          float edgeFade = 1.0 - abs(vUv.y - 0.5) * 2.0;

          // Streaks blaze brighter during beats
          vec3 baseColor = vec3(0.3, 0.8, 1.0);
          vec3 hotColor = vec3(0.6, 1.0, 1.0);
          vec3 color = mix(baseColor, hotColor, uDecay);
          float alpha = fade * edgeFade * (0.3 + uDecay * 0.7);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  streakMaterial.uniforms.uDecay.value = decay;

  // Ocean floor - bumpy terrain with scrolling wireframe
  const floorMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTravel: { value: 0 },
        uDecay: { value: 0 },
      },
      vertexShader: `
        uniform float uTravel;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vScrollZ;

        // Simplex noise for bumpy terrain
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
          vUv = uv;

          // Plane is rotated -90° around X, so position.y maps to world -Z
          // This is the scroll direction for the RIPPING motion
          float scrollY = position.y + uTravel;
          vScrollZ = scrollY;

          // Bumpy terrain using scrolling noise coordinates
          // position.x = world X, scrollY = world Z (after rotation)
          vec3 noiseCoord = vec3(position.x * 0.1, scrollY * 0.1, 0.0);
          float height = snoise(noiseCoord) * 1.0;
          height += snoise(noiseCoord * 2.5) * 0.4;
          height += snoise(noiseCoord * 5.0) * 0.15;

          // Displace along the plane's local Z (which becomes world Y after rotation)
          vec3 displaced = position;
          displaced.z += height;

          vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTravel;
        uniform float uDecay;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vScrollZ; // This is the scrolling Y coord (becomes world Z)

        void main() {
          // Distance fade
          float distZ = abs(vWorldPos.z);
          float distX = abs(vWorldPos.x);
          float distFade = smoothstep(45.0, 8.0, distZ) * smoothstep(35.0, 8.0, distX);

          // WIREFRAME GRID - squares that RIP past
          float gridScale = 1.8;
          float lineWidth = 0.06;

          // Grid uses world X and scrolling Y (which is world Z after rotation)
          float gridX = vWorldPos.x * gridScale;
          float gridY = vScrollZ * gridScale;

          // Lines in BOTH directions for proper squares
          float distToLineX = abs(fract(gridX + 0.5) - 0.5);
          float distToLineY = abs(fract(gridY + 0.5) - 0.5);

          float lineX = smoothstep(lineWidth, lineWidth * 0.3, distToLineX);
          float lineY = smoothstep(lineWidth, lineWidth * 0.3, distToLineY);

          // Combine for grid squares
          float grid = max(lineX, lineY);

          // Brighten grid on beats
          float gridIntensity = 0.3 + uDecay * 0.5;

          // Dark terrain base
          vec3 terrainColor = vec3(0.01, 0.03, 0.05);

          // Wireframe colors
          vec3 wireColor = vec3(0.0, 0.45, 0.55);
          vec3 wireGlow = vec3(0.1, 0.7, 0.8);

          // Compose
          vec3 color = terrainColor;
          color += wireColor * grid * gridIntensity;
          color += wireGlow * grid * uDecay * 0.4;

          float alpha = distFade * (0.5 + grid * 0.4);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  floorMaterial.uniforms.uTime.value = time;
  floorMaterial.uniforms.uTravel.value = travel;
  floorMaterial.uniforms.uDecay.value = decay;

  // Seaweed strands - spread wide across the ocean floor
  const seaweedCount = 50; // Fewer for less density
  const seaweedLoopLength = 100; // Longer loop = more spread out in Z
  const seaweeds = useMemo(() => {
    return Array.from({ length: seaweedCount }, (_, i) => ({
      // Wide X spread - way off to left and right
      x: (seededRandom(i * 37) - 0.5) * 40,
      // Spread evenly across long loop
      zOffset: (i / seaweedCount) * seaweedLoopLength + seededRandom(i * 41) * 8,
      // Tall seaweed
      height: 3.5 + seededRandom(i * 43) * 5.0,
      phase: seededRandom(i * 47) * Math.PI * 2,
      thickness: 0.08 + seededRandom(i * 53) * 0.1,
    }));
  }, []);

  const seaweedMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDecay: { value: 0 },
      },
      vertexShader: `
        varying float vProgress;
        varying vec3 vNormal;

        void main() {
          vProgress = uv.y;
          vNormal = normalMatrix * normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDecay;

        varying float vProgress;
        varying vec3 vNormal;

        void main() {
          // Gradient from base to tip
          vec3 baseColor = vec3(0.02, 0.15, 0.1);
          vec3 tipColor = vec3(0.05, 0.35, 0.25);
          vec3 glowColor = vec3(0.1, 0.6, 0.4);

          vec3 color = mix(baseColor, tipColor, vProgress);

          // Glow on beats
          color = mix(color, glowColor, uDecay * 0.4 * vProgress);

          // Simple rim lighting
          vec3 viewDir = vec3(0.0, 0.0, 1.0);
          float rim = 1.0 - abs(dot(vNormal, viewDir));
          color += vec3(0.0, 0.2, 0.15) * rim * 0.3;

          float alpha = 0.7 - vProgress * 0.3;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  seaweedMaterial.uniforms.uTime.value = time;
  seaweedMaterial.uniforms.uDecay.value = decay;

  return (
    <group>
      {/* Rushing particles */}
      <points geometry={particleGeometry} material={particleMaterial} />

      {/* Speed streaks - RIPPING past along Z axis */}
      {streaks.map((streak, i) => {
        // Uses unified throttle via travel
        let z = ((streak.zOffset + travel) % streakLoopLength);
        z = z - 65; // Range: -65 to +15, pop happens far away

        // Streaks elongate on beats for speed effect
        const length = streak.length * (1 + decay * 4);
        const sMat = streakMaterial.clone();
        sMat.uniforms.uDecay.value = decay;

        return (
          <mesh
            key={`streak-${i}`}
            position={[streak.x, streak.y, z]}
            rotation={[Math.PI / 2, 0, 0]} // Align along Z axis
          >
            <planeGeometry args={[0.02, length]} />
            <primitive object={sMat} attach="material" />
          </mesh>
        );
      })}

      {/* Ocean floor - below the swim path */}
      <mesh position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 80, 64, 64]} />
        <primitive object={floorMaterial} attach="material" />
      </mesh>

      {/* Seaweed strands - rooted on floor, RIPPING past */}
      {seaweeds.map((weed, i) => {
        // Same travel speed as floor - uses unified throttle
        let z = ((weed.zOffset + travel) % seaweedLoopLength);
        // Range: -80 (way up front) to +20 (way back past camera)
        z = z - 80;

        // Build curved seaweed strand
        const segments = 12;
        const points: THREE.Vector3[] = [];
        for (let j = 0; j <= segments; j++) {
          const t = j / segments;
          const swayPhase = time * 1.5 + weed.phase + t * 2;
          const sway = Math.sin(swayPhase) * 0.3 * t * t;
          const secondarySway = Math.sin(swayPhase * 1.7 + 1) * 0.15 * t;

          // Beat sway boost
          const beatSway = Math.sin(swayPhase * 0.5) * decay * 0.4 * t;

          points.push(new THREE.Vector3(
            sway + secondarySway + beatSway,
            t * weed.height,
            Math.sin(swayPhase * 0.8) * 0.1 * t
          ));
        }

        const curve = new THREE.CatmullRomCurve3(points);
        const wMat = seaweedMaterial.clone();
        wMat.uniforms.uTime.value = time;
        wMat.uniforms.uDecay.value = decay;

        return (
          <mesh key={`weed-${i}`} position={[weed.x, -5, z]}>
            <tubeGeometry args={[curve, 8, weed.thickness, 6, false]} />
            <primitive object={wMat} attach="material" />
          </mesh>
        );
      })}

      {/* Ambient deep glow from below */}
      <pointLight position={[0, -8, 0]} intensity={0.4} color="#003344" distance={40} />
    </group>
  );
};
