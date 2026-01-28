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
  const throttle = baseSpeed + pulse * boostSpeed;

  // Detect loop/seek - if time goes backwards, reset to deterministic base
  if (time < lastTimeRef.current - 0.05) {
    travelRef.current = time * baseSpeed;
  }

  const deltaTime = Math.min(time - lastTimeRef.current, 0.1);
  if (deltaTime > 0) {
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
  const tileFadeStartZ = 70;

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
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
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
          uFadeStartZ: { value: tileFadeStartZ },
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
          uniform float uFadeStartZ;

          varying vec3 vWorldPos;
          varying float vLocalZ;

          void main() {
            float distZ = abs(vWorldPos.z);
            float distX = abs(vWorldPos.x);
            float distFade = smoothstep(uFadeStartZ, 15.0, distZ) * smoothstep(28.0, 10.0, distX);

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
        depthTest: true,
        side: THREE.FrontSide,
      });
    });
  }, [gridCellSize, numTiles, tileDepth, tileFadeStartZ]);

  tileMaterials.forEach((mat) => {
    mat.uniforms.uDecay.value = pulse;
  });

  // SEAWEED - instanced, hard-corner bends (low-poly), terrain-attached
  const floorY = -5;
  const floorWidth = 90;
  const floorHeightScale = 0.65;
  const seaweedLoopLength = 1320; // floorChunkDepth(220) * floorChunkCount(6)

  const seaweedInstances = useMemo(() => {
    const weeds: {
      x: number;
      zOffset: number;
      height: number;
      thickness: number;
      seed: number;
      yaw: number;
    }[] = [];

    const xStep = gridCellSize * 2;
    const zStep = gridCellSize * 2;
    const halfWidth = floorWidth * 0.5;

    const xSlots = Math.floor(floorWidth / xStep) + 1;
    const zSlots = Math.floor(seaweedLoopLength / zStep);

    for (let zi = 0; zi < zSlots; zi++) {
      for (let xi = 0; xi < xSlots; xi++) {
        const seed = zi * 1000 + xi;
        const baseX = (xi / (xSlots - 1)) * floorWidth - halfWidth;
        const baseZ = zi * zStep;

        // Keep the central "lane" a bit clearer so the jelly reads clean
        const centerClear =
          Math.abs(baseX) < 6 ? 0.35 : Math.abs(baseX) < 12 ? 0.18 : 0.0;

        // Density varies with x and some clumping so it feels natural, not a grid
        const edgeBias = Math.min(1, Math.abs(baseX) / halfWidth);
        const clump = 0.6 + seededRandom(seed * 71) * 0.6;
        const density =
          (0.11 + edgeBias * 0.16 + seededRandom(seed * 19) * 0.08 - centerClear) * clump;

        if (seededRandom(seed * 17) > density) continue;

        const xJitter = (seededRandom(seed * 23) - 0.5) * 0.9;
        const zJitter = (seededRandom(seed * 29) - 0.5) * 0.9;

        const height = 1.2 + seededRandom(seed * 43) * 3.4;
        const thickness = 0.09 + seededRandom(seed * 53) * 0.12;

        weeds.push({
          x: baseX + xJitter,
          zOffset: baseZ + zJitter,
          height,
          thickness,
          seed: seededRandom(seed * 61) * 1000,
          yaw: (seededRandom(seed * 67) - 0.5) * Math.PI * 0.35,
        });
      }
    }

    return weeds;
  }, [floorWidth, gridCellSize, seaweedLoopLength]);

  const seaweedGeometry = useMemo(() => {
    const segs = 12;
    const geom = new THREE.CylinderGeometry(1, 1, 1, 5, segs, true);
    geom.translate(0, 0.5, 0);
    geom.computeVertexNormals();
    return geom;
  }, []);

  const seaweedMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDecay: { value: 0 },
        uTravel: { value: 0 },
        uSpeed: { value: 0 },
        uBaseZStart: { value: 0 },
        uFloorHeightScale: { value: floorHeightScale },
        uLoopLength: { value: seaweedLoopLength },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uDecay;
        uniform float uTravel;
        uniform float uSpeed;
        uniform float uBaseZStart;
        uniform float uFloorHeightScale;
        uniform float uLoopLength;

        attribute float aZOffset;
        attribute float aSeed;

        varying float vProgress;
        varying float vSeed;
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        float pmod(float x, float m) {
          return mod(mod(x, m) + m, m);
        }

        float hash21(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);

          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));

          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float noiseAt(float x, float z0, float cell) {
          return valueNoise(vec2(x / cell, z0 / cell));
        }

        float terrainHeight(float x, float z) {
          float n = 0.0;
          float amp = 0.55;
          float cell = 34.0;
          for (int i = 0; i < 5; i++) {
            float v = noiseAt(x, z, cell) * 2.0 - 1.0;
            n += v * amp;
            amp *= 0.5;
            cell *= 0.5;
          }

          float basins = noiseAt(x + 70.0, z - 120.0, 90.0);
          float h = n * 0.55 + 0.52;
          h -= (1.0 - basins) * 0.12;
          h = clamp(h, 0.0, 1.0);
          return h;
        }

        float hash11(float p) {
          return fract(sin(p) * 43758.5453123);
        }

        vec2 dirFromSeed(float seed, float i) {
          float a = (hash11(seed + i * 19.0) * 2.0 - 1.0) * 1.25;
          return normalize(vec2(cos(a), sin(a)));
        }

        void main() {
          float t = clamp(position.y, 0.0, 1.0);
          vec3 localPos = position;

          // Taper
          float taper = mix(1.0, 0.25, pow(t, 1.4));
          localPos.x *= taper;
          localPos.z *= taper;

          vec4 instanced = instanceMatrix * vec4(localPos, 1.0);
          vec3 instancePos = instanceMatrix[3].xyz;

          float zBelt = pmod(aZOffset + uTravel, uLoopLength);
          float centeredZ = zBelt - uLoopLength * 0.5;
          float terrainZ = uBaseZStart + zBelt;
          float seed = aSeed;

          float ground = terrainHeight(instancePos.x, terrainZ);
          float groundLift = ground * uFloorHeightScale + 0.03;

          vProgress = t;
          vSeed = seed;

          // Hard-corner bends: piecewise linear offsets per segment
          float offsetX = 0.0;
          float offsetZ = 0.0;

          const int SEG = 6;
          for (int ii = 0; ii < SEG; ii++) {
            float i = float(ii);
            float start = i / float(SEG);
            float end = (i + 1.0) / float(SEG);
            float localT = clamp((t - start) / (end - start), 0.0, 1.0);

            vec2 d = dirFromSeed(seed, i);

            float ampBase = (i + 1.0) / float(SEG);
            ampBase = ampBase * ampBase;
            float ampRand = mix(0.12, 0.42, hash11(seed + i * 31.0));
            float speed01 = clamp((uSpeed - 5.0) / 80.0, 0.0, 1.0);
            float beat = uDecay * 0.6;

            float sway = sin(uTime * (0.9 + hash11(seed) * 0.8) + i * 1.7 + seed) * (0.05 + beat * 0.08 + speed01 * 0.06);

            float amp = (ampRand + sway) * ampBase;
            offsetX += d.x * amp * localT;
            offsetZ += d.y * amp * localT;
          }

          instanced.x += offsetX;
          instanced.z += offsetZ + centeredZ;
          instanced.y += groundLift;

          vec4 world = modelMatrix * vec4(instanced.xyz, 1.0);
          vWorldPos = world.xyz;

          vNormal = normalize(mat3(modelViewMatrix * instanceMatrix) * normal);

          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uDecay;
        uniform float uSpeed;

        varying float vProgress;
        varying float vSeed;
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        float hash11(float p) {
          return fract(sin(p) * 43758.5453123);
        }

        void main() {
          float distZ = abs(vWorldPos.z);
          float distX = abs(vWorldPos.x);
          float distFade = smoothstep(92.0, 16.0, distZ) * smoothstep(44.0, 10.0, distX);

          float hue = hash11(vSeed) * 0.12;
          vec3 baseColor = vec3(0.01, 0.08, 0.06) + vec3(0.0, hue, hue * 0.5);
          vec3 tipColor = vec3(0.04, 0.42, 0.28) + vec3(hue * 0.2, hue * 0.6, hue * 0.1);
          vec3 glowColor = vec3(0.15, 0.85, 0.55);
          vec3 beatAccent = vec3(0.55, 0.0, 0.8);

          vec3 color = mix(baseColor, tipColor, pow(vProgress, 1.15));

          float speed01 = clamp((uSpeed - 5.0) / 80.0, 0.0, 1.0);
          float glow = (uDecay * 0.55 + speed01 * 0.18) * pow(vProgress, 1.5);
          color = mix(color, glowColor, glow);
          color += beatAccent * uDecay * 0.16 * pow(vProgress, 1.8);

          vec3 viewDir = vec3(0.0, 0.0, 1.0);
          float rim = 1.0 - abs(dot(normalize(vNormal), viewDir));
          color += vec3(0.0, 0.18, 0.14) * rim * 0.45;

          // Slight banding keeps it "low-poly game" even with shader glow
          float band = floor(vProgress * 7.0) / 7.0;
          color *= 0.9 + band * 0.22;

          color *= distFade;
          color += vec3(0.0, 0.01, 0.02) * (1.0 - distFade);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      transparent: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
  }, [floorHeightScale, seaweedLoopLength]);

  seaweedMaterial.uniforms.uTime.value = time;
  seaweedMaterial.uniforms.uDecay.value = pulse;
  seaweedMaterial.uniforms.uTravel.value = travel;
  seaweedMaterial.uniforms.uSpeed.value = throttle;
  seaweedMaterial.uniforms.uBaseZStart.value = 0;

  const seaweedMesh = useMemo(() => {
    const count = seaweedInstances.length;

    const geom = seaweedGeometry.clone();
    const zOffsets = new Float32Array(count);
    const seeds = new Float32Array(count);

    const mesh = new THREE.InstancedMesh(geom, seaweedMaterial, count);
    mesh.frustumCulled = false;
    mesh.renderOrder = -9;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const tmp = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const w = seaweedInstances[i];
      zOffsets[i] = w.zOffset;
      seeds[i] = w.seed;

      tmp.position.set(w.x, floorY, 0);
      tmp.rotation.set(0, w.yaw, 0);
      tmp.scale.set(w.thickness, w.height, w.thickness);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }

    geom.setAttribute("aZOffset", new THREE.InstancedBufferAttribute(zOffsets, 1));
    geom.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.instanceMatrix.needsUpdate = true;

    return mesh;
  }, [floorY, seaweedGeometry, seaweedInstances, seaweedMaterial]);

  return (
    <group>
      {/* Rushing particles */}
      <points geometry={particleGeometry} material={particleMaterial} />

      {/* Speed lines - streaking motion blur */}
      <mesh geometry={speedLineGeometry} material={speedLineMaterial} />

      {/* Ocean floor - tiles that move and loop */}
      {tileGeometries.map((geom, i) => {
        const tileBaseZ = i * tileDepth;
        // Wrap positions only when the entire tile is fully faded out.
        // Otherwise the near edge is still visible at wrap time and "teleports" across the scene.
        const wrapInvisibleZ = tileFadeStartZ + tileDepth / 2 + 1;
        const z =
          THREE.MathUtils.euclideanModulo(tileBaseZ + travel, floorLoopLength) -
          (floorLoopLength - wrapInvisibleZ);
        return (
          <mesh
            key={`floor-tile-${i}`}
            position={[0, -5, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            geometry={geom}
            renderOrder={-10}
            frustumCulled={false}
          >
            <primitive object={tileMaterials[i]} attach="material" />
          </mesh>
        );
      })}

      {/* Seaweed - instanced, terrain-attached */}
      <primitive object={seaweedMesh} />

      {/* Ambient deep glow from below */}
      <pointLight position={[0, -8, 0]} intensity={0.4} color="#003344" distance={40} />
    </group>
  );
};
