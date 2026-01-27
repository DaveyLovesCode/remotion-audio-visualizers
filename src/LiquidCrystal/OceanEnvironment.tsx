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
  const pulse = audioFrame.pulse ?? 0;

  // THROTTLE - unified speed control
  // pulse acts as the gas pedal: high pulse = RIPPING, low pulse = cruising
  const travelRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Base cruise + massive boost for ripping through on beats
  const baseSpeed = 5.0;
  const boostSpeed = 80.0;

  // Detect loop/seek - if time goes backwards, reset to deterministic base
  if (time < lastTimeRef.current - 0.05) {
    travelRef.current = time * baseSpeed;
  }

  const deltaTime = Math.min(time - lastTimeRef.current, 0.1);
  if (deltaTime > 0) {
    const throttle = baseSpeed + pulse * boostSpeed;
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

  // Particle shader - z position computed on GPU
  const particleMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uDecay: { value: 0 },
        uTravel: { value: 0 },
        uLoopLength: { value: particleLoopLength },
      },
      vertexShader: `
        varying float vBrightness;
        attribute float brightness;
        attribute float zOffset;

        uniform float uTravel;
        uniform float uLoopLength;

        void main() {
          vBrightness = brightness;

          // Compute z on GPU instead of JS loop
          float z = mod(zOffset + uTravel, uLoopLength) - 65.0;
          vec3 pos = vec3(position.x, position.y, z);

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
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

  particleMaterial.uniforms.uDecay.value = pulse;
  particleMaterial.uniforms.uTravel.value = travel;

  // Particle geometry - z computed in shader, not JS
  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const brightnesses = new Float32Array(particleCount);
    const zOffsets = new Float32Array(particleCount);

    particles.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = 0; // Placeholder, computed in shader
      brightnesses[i] = p.brightness;
      zOffsets[i] = p.zOffset;
    });

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("brightness", new THREE.BufferAttribute(brightnesses, 1));
    geometry.setAttribute("zOffset", new THREE.BufferAttribute(zOffsets, 1));
    return geometry;
  }, [particles]);

  // SPEED LINES - distributed on a sphere shell so visible from any camera angle
  const speedLineCount = 150;
  const speedLineLoopLength = 80;

  const speedLines = useMemo(() => {
    return Array.from({ length: speedLineCount }, (_, i) => {
      // Distribute on sphere using fibonacci spiral for even coverage
      const phi = Math.acos(1 - 2 * (i + 0.5) / speedLineCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;

      const radius = 4 + seededRandom(i * 37) * 4; // 4-8 units from center
      const x = Math.sin(phi) * Math.cos(theta) * radius;
      const y = Math.sin(phi) * Math.sin(theta) * radius;
      const z = Math.cos(phi) * radius;

      return {
        x,
        y,
        // z becomes zOffset - the line streams from this z position
        zOffset: ((z + 8) / 16) * speedLineLoopLength + seededRandom(i * 41) * 10,
        length: 2.0 + seededRandom(i * 43) * 4.0,
        brightness: 0.6 + seededRandom(i * 47) * 0.4,
      };
    });
  }, []);

  const speedLineMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uDecay: { value: 0 },
        uTravel: { value: 0 },
        uLoopLength: { value: speedLineLoopLength },
      },
      vertexShader: `
        attribute float brightness;
        attribute float zOffset;
        attribute float lineLength;

        uniform float uTravel;
        uniform float uLoopLength;

        varying float vBrightness;
        varying float vT;

        void main() {
          vBrightness = brightness;
          vT = uv.y;

          // Same z logic as particles - always looping through visible range
          float baseZ = mod(zOffset + uTravel, uLoopLength) - 65.0;
          float z = baseZ + uv.y * lineLength;

          vec3 pos = vec3(position.x, position.y, z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uDecay;

        varying float vBrightness;
        varying float vT;

        void main() {
          // Fade from bright at front to dim at tail
          float fade = 1.0 - vT * 0.7;

          // ZERO at rest, only visible when audio reacts
          float alpha = uDecay * vBrightness * fade * 0.9;

          vec3 color = vec3(0.7, 0.95, 1.0);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  speedLineMaterial.uniforms.uDecay.value = pulse;
  speedLineMaterial.uniforms.uTravel.value = travel;

  const speedLineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const verticesPerLine = 4;
    const indicesPerLine = 6;

    const positions = new Float32Array(speedLineCount * verticesPerLine * 3);
    const uvs = new Float32Array(speedLineCount * verticesPerLine * 2);
    const brightnesses = new Float32Array(speedLineCount * verticesPerLine);
    const zOffsets = new Float32Array(speedLineCount * verticesPerLine);
    const lineLengths = new Float32Array(speedLineCount * verticesPerLine);
    const indices = new Uint16Array(speedLineCount * indicesPerLine);

    const lineWidth = 0.03;

    speedLines.forEach((line, i) => {
      const vi = i * verticesPerLine;
      const ii = i * indicesPerLine;

      // Front left
      positions[vi * 3 + 0] = line.x - lineWidth;
      positions[vi * 3 + 1] = line.y;
      positions[vi * 3 + 2] = 0;
      uvs[vi * 2 + 0] = 0;
      uvs[vi * 2 + 1] = 0;

      // Front right
      positions[(vi + 1) * 3 + 0] = line.x + lineWidth;
      positions[(vi + 1) * 3 + 1] = line.y;
      positions[(vi + 1) * 3 + 2] = 0;
      uvs[(vi + 1) * 2 + 0] = 1;
      uvs[(vi + 1) * 2 + 1] = 0;

      // Back left
      positions[(vi + 2) * 3 + 0] = line.x - lineWidth;
      positions[(vi + 2) * 3 + 1] = line.y;
      positions[(vi + 2) * 3 + 2] = 0;
      uvs[(vi + 2) * 2 + 0] = 0;
      uvs[(vi + 2) * 2 + 1] = 1;

      // Back right
      positions[(vi + 3) * 3 + 0] = line.x + lineWidth;
      positions[(vi + 3) * 3 + 1] = line.y;
      positions[(vi + 3) * 3 + 2] = 0;
      uvs[(vi + 3) * 2 + 0] = 1;
      uvs[(vi + 3) * 2 + 1] = 1;

      for (let v = 0; v < 4; v++) {
        brightnesses[vi + v] = line.brightness;
        zOffsets[vi + v] = line.zOffset;
        lineLengths[vi + v] = line.length;
      }

      indices[ii + 0] = vi;
      indices[ii + 1] = vi + 2;
      indices[ii + 2] = vi + 1;
      indices[ii + 3] = vi + 1;
      indices[ii + 4] = vi + 2;
      indices[ii + 5] = vi + 3;
    });

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("brightness", new THREE.BufferAttribute(brightnesses, 1));
    geometry.setAttribute("zOffset", new THREE.BufferAttribute(zOffsets, 1));
    geometry.setAttribute("lineLength", new THREE.BufferAttribute(lineLengths, 1));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    return geometry;
  }, [speedLines]);

  // FLOOR TILES - discrete meshes that move and loop
  const gridCellSize = 2.5;
  const tileDepth = 50;
  const tileWidth = 60;
  const numTiles = 4;
  const floorLoopLength = tileDepth * numTiles;

  const hash2 = (x: number, z: number) => {
    const val = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return val - Math.floor(val);
  };

  const totalCellsZ = Math.floor(floorLoopLength / gridCellSize);

  const createTileGeometry = useMemo(() => {
    return (tileIndex: number) => {
      const cellsX = Math.floor(tileWidth / gridCellSize);
      const cellsZ = Math.floor(tileDepth / gridCellSize);
      const geometry = new THREE.PlaneGeometry(
        tileWidth,
        tileDepth,
        cellsX,
        cellsZ
      );

      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);

        // FIX: negate y because after -90° rotation, local y=-25 becomes front (higher world Z)
        // This ensures edges that physically meet have matching height calculations
        const globalZ = -y + tileIndex * tileDepth;
        const gx = x / gridCellSize;
        const gz = globalZ / gridCellSize;

        const cx0 = Math.floor(gx);
        const cx1 = cx0 + 1;
        const cz0 = ((Math.floor(gz) % totalCellsZ) + totalCellsZ) % totalCellsZ;
        const cz1 = (cz0 + 1) % totalCellsZ;

        const h00 = hash2(cx0, cz0) * 1.0;
        const h10 = hash2(cx1, cz0) * 1.0;
        const h01 = hash2(cx0, cz1) * 1.0;
        const h11 = hash2(cx1, cz1) * 1.0;

        const fx = gx - Math.floor(gx);
        const fz = gz - Math.floor(gz);
        const h0 = h00 + (h10 - h00) * fx;
        const h1 = h01 + (h11 - h01) * fx;
        const height = h0 + (h1 - h0) * fz;

        positions.setZ(i, height);
      }

      geometry.computeVertexNormals();
      return geometry;
    };
  }, [gridCellSize, tileDepth, tileWidth, totalCellsZ]);

  const tileGeometries = useMemo(() => {
    return Array.from({ length: numTiles }, (_, i) => createTileGeometry(i));
  }, [createTileGeometry, numTiles]);

  const tileMaterials = useMemo(() => {
    return Array.from({ length: numTiles }, (_, tileIndex) => {
      return new THREE.ShaderMaterial({
        uniforms: {
          uDecay: { value: 0 },
          uGridCellSize: { value: gridCellSize },
          uTileOffsetZ: { value: tileIndex * tileDepth },
        },
        vertexShader: `
          uniform float uTileOffsetZ;

          varying vec3 vWorldPos;
          varying float vLocalZ;

          void main() {
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            // Match the negated y from geometry creation
            vLocalZ = -position.y + uTileOffsetZ;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uDecay;
          uniform float uGridCellSize;

          varying vec3 vWorldPos;
          varying float vLocalZ;

          void main() {
            float distZ = abs(vWorldPos.z);
            float distX = abs(vWorldPos.x);
            float distFade = smoothstep(70.0, 15.0, distZ) * smoothstep(28.0, 10.0, distX);

            float cellX = vWorldPos.x / uGridCellSize;
            float cellZ = vLocalZ / uGridCellSize;

            float distToLineX = abs(fract(cellX + 0.5) - 0.5);
            float distToLineZ = abs(fract(cellZ + 0.5) - 0.5);

            float lineWidth = 0.01;
            float lineX = smoothstep(lineWidth, lineWidth * 0.25, distToLineX);
            float lineZ = smoothstep(lineWidth, lineWidth * 0.25, distToLineZ);
            float grid = max(lineX, lineZ);

            float gridIntensity = 0.6 + uDecay * 0.4;

            vec3 terrainColor = vec3(0.04, 0.08, 0.12);
            vec3 wireColor = vec3(0.0, 0.45, 0.55);
            vec3 wireGlow = vec3(0.1, 0.7, 0.8);

            vec3 color = terrainColor;
            color += wireColor * grid * gridIntensity;
            color += wireGlow * grid * uDecay * 0.4;

            float alpha = distFade * (0.5 + grid * 0.4);

            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        depthWrite: true, // FIX: prevents transparency sorting flicker
        side: THREE.DoubleSide,
      });
    });
  }, [gridCellSize, numTiles, tileDepth]);

  tileMaterials.forEach((mat) => {
    mat.uniforms.uDecay.value = pulse;
  });

  // Seaweed strands - positioned at grid intersections for visual coherence
  // Grid cells are gridCellSize units wide, so place seaweed at multiples of gridCellSize
  const seaweedLoopLength = 200; // Must be multiple of gridCellSize (200 = 80 × 2.5)
  const xSlots = 21; // Grid columns: -25 to +25 in steps of 2.5
  const zSlots = Math.floor(seaweedLoopLength / gridCellSize); // 80 grid rows in loop

  const seaweeds = useMemo(() => {
    const strands: {
      x: number;
      zOffset: number;
      height: number;
      phase: number;
      thickness: number;
    }[] = [];

    // Place seaweed at grid intersections with some randomness in which slots get filled
    for (let xi = 0; xi < xSlots; xi++) {
      for (let zi = 0; zi < zSlots; zi++) {
        const seed = xi * 100 + zi;
        // ~30% chance of seaweed at each intersection
        if (seededRandom(seed * 17) > 0.3) continue;

        // Exact grid position
        const x = (xi - Math.floor(xSlots / 2)) * gridCellSize;
        const zBase = zi * gridCellSize;

        // Slight offset from exact intersection for natural feel
        const xJitter = (seededRandom(seed * 23) - 0.5) * 0.3;
        const zJitter = (seededRandom(seed * 29) - 0.5) * 0.3;

        strands.push({
          x: x + xJitter,
          zOffset: zBase + zJitter,
          height: 1.8 + seededRandom(seed * 43) * 2.2,
          phase: seededRandom(seed * 47) * Math.PI * 2,
          thickness: 0.06 + seededRandom(seed * 53) * 0.08,
        });
      }
    }
    return strands;
  }, [gridCellSize]);

  // Per-seaweed materials
  const seaweedMaterials = useMemo(() => {
    return seaweeds.map((weed) => {
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDecay: { value: 0 },
          uPhase: { value: weed.phase },
        },
        vertexShader: `
          uniform float uTime;
          uniform float uPhase;

          varying float vProgress;
          varying vec3 vNormal;

          void main() {
            float t = uv.y;
            vProgress = t;
            vNormal = normalMatrix * normal;

            float swayPhase = uTime * 1.5 + uPhase + t * 2.0;
            float sway = sin(swayPhase) * 0.3 * t * t;
            float secondarySway = sin(swayPhase * 1.7 + 1.0) * 0.15 * t;
            float zSway = sin(swayPhase * 0.8) * 0.1 * t;

            vec3 animatedPos = position;
            animatedPos.x += sway + secondarySway;
            animatedPos.z += zSway;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(animatedPos, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uDecay;

          varying float vProgress;
          varying vec3 vNormal;

          void main() {
            vec3 baseColor = vec3(0.02, 0.15, 0.1);
            vec3 tipColor = vec3(0.05, 0.35, 0.25);
            vec3 glowColor = vec3(0.1, 0.6, 0.4);

            vec3 color = mix(baseColor, tipColor, vProgress);
            color = mix(color, glowColor, uDecay * 0.4 * vProgress);

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
    });
  }, [seaweeds]);

  // Update seaweed uniforms
  seaweedMaterials.forEach((mat) => {
    mat.uniforms.uTime.value = time;
    mat.uniforms.uDecay.value = pulse;
  });

  // Static seaweed geometries
  const seaweedGeometries = useMemo(() => {
    return seaweeds.map((weed) => {
      const segments = 12;
      const points: THREE.Vector3[] = [];
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        points.push(new THREE.Vector3(0, t * weed.height, 0));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      return new THREE.TubeGeometry(curve, 8, weed.thickness, 6, false);
    });
  }, [seaweeds]);

  return (
    <group>
      {/* Rushing particles */}
      <points geometry={particleGeometry} material={particleMaterial} />

      {/* Speed lines - streaking motion blur */}
      <mesh geometry={speedLineGeometry} material={speedLineMaterial} />

      {/* Ocean floor - tiles that move and loop */}
      {tileGeometries.map((geom, i) => {
        const tileBaseZ = i * tileDepth;
        const z =
          ((tileBaseZ + travel) % floorLoopLength) -
          floorLoopLength / 2 -
          tileDepth / 2;
        return (
          <mesh
            key={`floor-tile-${i}`}
            position={[0, -5, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            geometry={geom}
          >
            <primitive object={tileMaterials[i]} attach="material" />
          </mesh>
        );
      })}

      {/* Seaweed strands - GPU-animated sway, aligned to grid intersections */}
      {seaweedGeometries.map((geom, i) => {
        // Offset -100 (= 40 × 2.5) ensures grid alignment
        const z = ((seaweeds[i].zOffset + travel) % seaweedLoopLength) - 100;
        return (
          <mesh key={`weed-${i}`} position={[seaweeds[i].x, -5, z]} geometry={geom}>
            <primitive object={seaweedMaterials[i]} attach="material" />
          </mesh>
        );
      })}

      {/* Ambient deep glow from below */}
      <pointLight position={[0, -8, 0]} intensity={0.4} color="#003344" distance={40} />
    </group>
  );
};
