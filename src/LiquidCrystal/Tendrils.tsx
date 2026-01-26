import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";

interface TendrilsProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
  count?: number;
  anchorRef: RefObject<THREE.Object3D | null>;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

type TendrilConfig = {
  baseAngle: number;
  radiusOffset: number;
  length: number;
  phaseOffset: number;
  thickness: number;
  index: number;
};

type TendrilRuntime = {
  config: TendrilConfig;
  segments: number;
  pointCount: number;
  restLength: number;
  ropePos: Float32Array;
  ropePrev: Float32Array;
  initialized: boolean;
  geometry: THREE.BufferGeometry;
  centerPositions: Float32Array;
  tangents: Float32Array;
  positionAttr: THREE.BufferAttribute;
  tangentAttr: THREE.BufferAttribute;
  material: THREE.ShaderMaterial;
};

const createRibbonGeometry = (segments: number) => {
  const pointCount = segments + 1;
  const vertexCount = pointCount * 2;

  const centerPositions = new Float32Array(vertexCount * 3);
  const tangents = new Float32Array(vertexCount * 3);
  const aT = new Float32Array(vertexCount);
  const aSide = new Float32Array(vertexCount);
  const indexArray = new Uint16Array(segments * 6);

  for (let i = 0; i < pointCount; i++) {
    const t = i / segments;
    const v0 = i * 2;
    const v1 = v0 + 1;
    aT[v0] = t;
    aT[v1] = t;
    aSide[v0] = -1;
    aSide[v1] = 1;
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    const idx = i * 6;
    indexArray[idx + 0] = a;
    indexArray[idx + 1] = c;
    indexArray[idx + 2] = b;
    indexArray[idx + 3] = b;
    indexArray[idx + 4] = c;
    indexArray[idx + 5] = d;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));

  const positionAttr = new THREE.BufferAttribute(centerPositions, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  const tangentAttr = new THREE.BufferAttribute(tangents, 3);
  tangentAttr.setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("aTangent", tangentAttr);
  geometry.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
  geometry.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));

  return { geometry, centerPositions, tangents, positionAttr, tangentAttr, pointCount };
};

const createTendrilMaterial = (phaseOffset: number, index: number) => {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDecay: { value: 0 },
      uPhase: { value: 0 },
      uPhaseOffset: { value: phaseOffset },
      uTendrilIndex: { value: index },
      uWidthRoot: { value: 0.055 },
      uWidthTip: { value: 0.012 },
    },
    vertexShader: `
      uniform float uWidthRoot;
      uniform float uWidthTip;

      attribute float aT;
      attribute float aSide;
      attribute vec3 aTangent;

      varying float vT;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec3 vCenterWorld;

      void main() {
        vT = aT;

        vec3 center = position;
        vec3 tangent = normalize(aTangent);

        vec4 centerWorld4 = modelMatrix * vec4(center, 1.0);
        vec3 centerWorld = centerWorld4.xyz;
        vCenterWorld = centerWorld;

        vec3 viewDir = normalize(cameraPosition - centerWorld);
        vec3 sideDir = normalize(cross(viewDir, tangent));

        float width = mix(uWidthRoot, uWidthTip, pow(aT, 1.25));
        vec3 worldPos = centerWorld + sideDir * aSide * width;

        vWorldPos = worldPos;
        vNormal = normalize(cross(tangent, sideDir)) * aSide;

        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uDecay;
      uniform float uPhase;
      uniform float uPhaseOffset;
      uniform float uTendrilIndex;

      varying float vT;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec3 vCenterWorld;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 2.6);

        vec3 attachColor = vec3(0.0, 0.85, 0.65);
        vec3 baseColor = vec3(0.0, 0.55, 0.75);
        vec3 tipColor = vec3(0.62, 0.22, 0.95);
        vec3 glowColor = vec3(0.0, 1.0, 0.85);

        vec3 color;
        if (vT < 0.1) {
          color = mix(attachColor, baseColor, vT / 0.1);
        } else {
          color = mix(baseColor, tipColor, (vT - 0.1) / 0.9);
        }

        float phase = uPhase * 1.35 + uPhaseOffset + uTendrilIndex * 0.35;
        float pulse = sin(vT * 8.5 - phase * 1.9);
        pulse = smoothstep(0.15, 0.85, pulse * 0.5 + 0.5);
        color = mix(color, glowColor, pulse * 0.45 * (0.45 + uDecay));

        float shimmer = sin(phase * 0.7 + vCenterWorld.x * 3.0 + vCenterWorld.y * 2.0 + vT * 9.0);
        shimmer = smoothstep(0.4, 1.0, shimmer);
        color += glowColor * shimmer * 0.12 * (0.35 + uDecay);

        color += glowColor * fresnel * (0.35 + uDecay * 0.35);

        float baseAlpha = smoothstep(0.0, 0.12, 0.12 - vT) * 0.55;
        float bodyAlpha = (1.0 - vT * 0.65) * (0.42 + uDecay * 0.28);
        float alpha = (baseAlpha + bodyAlpha) * (0.55 + fresnel * 0.55);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
};

const setVec3 = (arr: Float32Array, idx3: number, x: number, y: number, z: number) => {
  arr[idx3 + 0] = x;
  arr[idx3 + 1] = y;
  arr[idx3 + 2] = z;
};

/**
 * Tendrils - physics rope ribbons (CPU sim, GPU shaded)
 * Deterministic within a forward-ticking timeline; resets cleanly on seeks.
 */
export const Tendrils: React.FC<TendrilsProps> = ({
  frame,
  audioFrame,
  fps,
  count = 12,
  anchorRef,
}) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;

  // Accumulated phase - constant flow, speeds up on beats (drives shimmer)
  const phaseRef = useRef(0);
  const lastTimeRef = useRef(0);

  const baseSpeed = 1.15;
  const boostSpeed = 3.4;

  const simTimeRef = useRef(0);
  const lastAnchorTimeRef = useRef(0);
  const anchorPrevRef = useRef<Float32Array>(new Float32Array(count * 3));

  const tmpLocal = useMemo(() => new THREE.Vector3(), []);
  const tmpWorld = useMemo(() => new THREE.Vector3(), []);
  const tmpDown = useMemo(() => new THREE.Vector3(0, -1, 0), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const fallbackMatrixWorld = useMemo(() => new THREE.Matrix4(), []);
  const hadAnchorRef = useRef(false);
  const resetTokenRef = useRef(0);
  const appliedResetTokenRef = useRef(-1);

  if (anchorPrevRef.current.length !== count * 3) {
    anchorPrevRef.current = new Float32Array(count * 3);
    simTimeRef.current = time;
    lastAnchorTimeRef.current = time;
    resetTokenRef.current++;
  }

  // Detect loop/seek - reset if time goes backwards (Remotion seeking)
  if (time < lastTimeRef.current - 0.05 || time < simTimeRef.current - 0.05) {
    phaseRef.current = time * baseSpeed;
    simTimeRef.current = time;
    lastAnchorTimeRef.current = time;
    anchorPrevRef.current = new Float32Array(count * 3);
    resetTokenRef.current++;
  }

  const deltaTime = Math.min(time - lastTimeRef.current, 0.1);
  if (deltaTime > 0) {
    phaseRef.current += (baseSpeed + decay * boostSpeed) * deltaTime;
  }
  lastTimeRef.current = time;
  const phase = phaseRef.current;

  // Generate tendril configurations
  const tendrils: TendrilConfig[] = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const radiusOffset = 0.35 + seededRandom(i * 7) * 0.25;
      return {
        baseAngle: angle,
        radiusOffset,
        length: 2.5 + seededRandom(i * 11) * 1.5,
        phaseOffset: seededRandom(i * 13) * Math.PI * 2,
        thickness: 0.035 + seededRandom(i * 17) * 0.03,
        index: i,
      };
    });
  }, [count]);

  const segments = 24;

  const anchorVectors = useMemo(
    () => Array.from({ length: count }, () => new THREE.Vector3()),
    [count],
  );

  const runtimes: TendrilRuntime[] = useMemo(() => {
    return tendrils.map((tendril) => {
      const { geometry, centerPositions, tangents, positionAttr, tangentAttr, pointCount } =
        createRibbonGeometry(segments);
      const material = createTendrilMaterial(tendril.phaseOffset, tendril.index);
      material.uniforms.uWidthRoot.value = 0.045 + tendril.thickness * 0.9;
      material.uniforms.uWidthTip.value = 0.010 + tendril.thickness * 0.35;

      return {
        config: tendril,
        segments,
        pointCount,
        restLength: tendril.length / segments,
        ropePos: new Float32Array(pointCount * 3),
        ropePrev: new Float32Array(pointCount * 3),
        initialized: false,
        geometry,
        centerPositions,
        tangents,
        positionAttr,
        tangentAttr,
        material,
      };
    });
  }, [tendrils]);

  const attachmentGeometry = useMemo(() => new THREE.SphereGeometry(1, 10, 10), []);
  const attachmentMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: { uDecay: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPos = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uDecay;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 2.3);
          vec3 coreColor = vec3(0.0, 0.75, 0.55);
          vec3 glowColor = vec3(0.0, 1.0, 0.85);
          vec3 color = mix(coreColor, glowColor, fresnel);
          color += glowColor * uDecay * 0.35;
          float alpha = 0.45 + fresnel * 0.4 + uDecay * 0.2;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  useEffect(() => {
    return () => {
      runtimes.forEach((rt) => {
        rt.geometry.dispose();
        rt.material.dispose();
      });
      attachmentGeometry.dispose();
      attachmentMaterial.dispose();
    };
  }, [runtimes, attachmentGeometry, attachmentMaterial]);

  if (appliedResetTokenRef.current !== resetTokenRef.current) {
    appliedResetTokenRef.current = resetTokenRef.current;
    anchorPrevRef.current = new Float32Array(count * 3);
    simTimeRef.current = time;
    lastAnchorTimeRef.current = time;
    runtimes.forEach((rt) => {
      rt.initialized = false;
    });
  }

  // Update uniforms (shared per frame)
  runtimes.forEach((rt) => {
    rt.material.uniforms.uDecay.value = decay;
    rt.material.uniforms.uPhase.value = phase;
  });
  attachmentMaterial.uniforms.uDecay.value = decay;

  const anchorObj = anchorRef.current;
  const hasAnchor = !!anchorObj;
  if (hasAnchor !== hadAnchorRef.current) {
    hadAnchorRef.current = hasAnchor;
    // When the anchor becomes available (first mount commit), re-seed so we don't snap from fallback state.
    if (hasAnchor) {
      anchorPrevRef.current = new Float32Array(count * 3);
      runtimes.forEach((rt) => {
        rt.initialized = false;
      });
    }
  }

  let anchorMatrixWorld: THREE.Matrix4;
  if (anchorObj) {
    anchorObj.updateMatrixWorld(true);
    anchorMatrixWorld = anchorObj.matrixWorld;
    anchorObj.getWorldQuaternion(tmpQuat);
    tmpDown.set(0, -1, 0).applyQuaternion(tmpQuat).normalize();
  } else {
    anchorMatrixWorld = fallbackMatrixWorld.identity();
    // Reasonable default: jelly is pitched forward (-PI/2), so local -Y maps to world +Z.
    tmpDown.set(0, 0, 1);
  }
  const downX = tmpDown.x;
  const downY = tmpDown.y;
  const downZ = tmpDown.z;

  const now = time;
  const simDt = clamp(now - simTimeRef.current, 0, 1 / 30);
  simTimeRef.current = now;

  const anchorDt = clamp(now - lastAnchorTimeRef.current, 0, 1 / 30);
  lastAnchorTimeRef.current = now;

  const flowStrength = 1.6 + decay * 5.0;
  const flowX = 0;
  const flowY = 0;
  const flowZ = 1;

  const anchorPrev = anchorPrevRef.current;

  for (let i = 0; i < runtimes.length; i++) {
    const cfg = runtimes[i].config;
    const attachX = Math.cos(cfg.baseAngle) * cfg.radiusOffset;
    const attachZ = Math.sin(cfg.baseAngle) * cfg.radiusOffset;

    tmpLocal.set(attachX, 0.05, attachZ);
    tmpWorld.copy(tmpLocal).applyMatrix4(anchorMatrixWorld);
    anchorVectors[i].copy(tmpWorld);

    const a3 = i * 3;
    const prevAx = anchorPrev[a3 + 0];
    const prevAy = anchorPrev[a3 + 1];
    const prevAz = anchorPrev[a3 + 2];

    const ax = tmpWorld.x;
    const ay = tmpWorld.y;
    const az = tmpWorld.z;

    anchorPrev[a3 + 0] = ax;
    anchorPrev[a3 + 1] = ay;
    anchorPrev[a3 + 2] = az;

    const rt = runtimes[i];
    const pointCount = rt.pointCount;
    const rest = rt.restLength;

    if (!rt.initialized) {
      for (let p = 0; p < pointCount; p++) {
        const px = ax + downX * rest * p;
        const py = ay + downY * rest * p;
        const pz = az + downZ * rest * p;
        setVec3(rt.ropePos, p * 3, px, py, pz);
        setVec3(rt.ropePrev, p * 3, px, py, pz);
      }
      rt.initialized = true;
    } else if (simDt > 0) {
      const invDt = anchorDt > 0 ? 1 / anchorDt : 0;
      const vx = (ax - prevAx) * invDt;
      const vy = (ay - prevAy) * invDt;
      const vz = (az - prevAz) * invDt;

      const windX = -vx + flowX * flowStrength;
      const windY = -vy + flowY * flowStrength;
      const windZ = -vz + flowZ * flowStrength;

      const drag = 0.06 + decay * 0.04;
      const dt2 = simDt * simDt;

      // Integrate (Verlet)
      for (let p = 1; p < pointCount; p++) {
        const idx = p * 3;
        const px = rt.ropePos[idx + 0];
        const py = rt.ropePos[idx + 1];
        const pz = rt.ropePos[idx + 2];

        const ox = rt.ropePrev[idx + 0];
        const oy = rt.ropePrev[idx + 1];
        const oz = rt.ropePrev[idx + 2];

        const velX = (px - ox) * (1 - drag);
        const velY = (py - oy) * (1 - drag);
        const velZ = (pz - oz) * (1 - drag);

        rt.ropePrev[idx + 0] = px;
        rt.ropePrev[idx + 1] = py;
        rt.ropePrev[idx + 2] = pz;

        const t = p / (pointCount - 1);
        const windScale = (0.65 + t * 0.9) * (0.7 + decay * 0.6);

        rt.ropePos[idx + 0] = px + velX + windX * windScale * dt2;
        rt.ropePos[idx + 1] = py + velY + windY * windScale * dt2;
        rt.ropePos[idx + 2] = pz + velZ + windZ * windScale * dt2;
      }

      // Pin root + lightly steer early segment into the attachment frame
      setVec3(rt.ropePos, 0, ax, ay, az);
      const steer = 0.28;
      const s1 = 3;
      rt.ropePos[s1 + 0] = rt.ropePos[s1 + 0] * (1 - steer) + (ax + downX * rest) * steer;
      rt.ropePos[s1 + 1] = rt.ropePos[s1 + 1] * (1 - steer) + (ay + downY * rest) * steer;
      rt.ropePos[s1 + 2] = rt.ropePos[s1 + 2] * (1 - steer) + (az + downZ * rest) * steer;

      // Constraints (PBD)
      const iterations = 4;
      for (let iter = 0; iter < iterations; iter++) {
        setVec3(rt.ropePos, 0, ax, ay, az);
        for (let p = 0; p < pointCount - 1; p++) {
          const i0 = p * 3;
          const i1 = (p + 1) * 3;

          const x0 = rt.ropePos[i0 + 0];
          const y0 = rt.ropePos[i0 + 1];
          const z0 = rt.ropePos[i0 + 2];
          const x1 = rt.ropePos[i1 + 0];
          const y1 = rt.ropePos[i1 + 1];
          const z1 = rt.ropePos[i1 + 2];

          const dx = x1 - x0;
          const dy = y1 - y0;
          const dz = z1 - z0;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const diff = (dist - rest) / dist;

          const corrX = dx * diff;
          const corrY = dy * diff;
          const corrZ = dz * diff;

          if (p === 0) {
            rt.ropePos[i1 + 0] = x1 - corrX;
            rt.ropePos[i1 + 1] = y1 - corrY;
            rt.ropePos[i1 + 2] = z1 - corrZ;
          } else {
            rt.ropePos[i0 + 0] = x0 + corrX * 0.5;
            rt.ropePos[i0 + 1] = y0 + corrY * 0.5;
            rt.ropePos[i0 + 2] = z0 + corrZ * 0.5;
            rt.ropePos[i1 + 0] = x1 - corrX * 0.5;
            rt.ropePos[i1 + 1] = y1 - corrY * 0.5;
            rt.ropePos[i1 + 2] = z1 - corrZ * 0.5;
          }
        }
      }
    }

    // Write ribbon buffers (center positions + tangents)
    const center = rt.centerPositions;
    const tangents = rt.tangents;
    for (let p = 0; p < pointCount; p++) {
      const idx = p * 3;
      const px = rt.ropePos[idx + 0];
      const py = rt.ropePos[idx + 1];
      const pz = rt.ropePos[idx + 2];

      let tx: number;
      let ty: number;
      let tz: number;

      if (p === 0) {
        const nx = rt.ropePos[idx + 3] - px;
        const ny = rt.ropePos[idx + 4] - py;
        const nz = rt.ropePos[idx + 5] - pz;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-6;
        tx = nx / len;
        ty = ny / len;
        tz = nz / len;
      } else if (p === pointCount - 1) {
        const px0 = rt.ropePos[idx - 3];
        const py0 = rt.ropePos[idx - 2];
        const pz0 = rt.ropePos[idx - 1];
        const nx = px - px0;
        const ny = py - py0;
        const nz = pz - pz0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-6;
        tx = nx / len;
        ty = ny / len;
        tz = nz / len;
      } else {
        const px0 = rt.ropePos[idx - 3];
        const py0 = rt.ropePos[idx - 2];
        const pz0 = rt.ropePos[idx - 1];
        const px1 = rt.ropePos[idx + 3];
        const py1 = rt.ropePos[idx + 4];
        const pz1 = rt.ropePos[idx + 5];
        const nx = px1 - px0;
        const ny = py1 - py0;
        const nz = pz1 - pz0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-6;
        tx = nx / len;
        ty = ny / len;
        tz = nz / len;
      }

      const v0 = (p * 2) * 3;
      const v1 = v0 + 3;

      center[v0 + 0] = px;
      center[v0 + 1] = py;
      center[v0 + 2] = pz;
      center[v1 + 0] = px;
      center[v1 + 1] = py;
      center[v1 + 2] = pz;

      tangents[v0 + 0] = tx;
      tangents[v0 + 1] = ty;
      tangents[v0 + 2] = tz;
      tangents[v1 + 0] = tx;
      tangents[v1 + 1] = ty;
      tangents[v1 + 2] = tz;
    }

    rt.positionAttr.needsUpdate = true;
    rt.tangentAttr.needsUpdate = true;
  }

  return (
    <>
      {runtimes.map((rt, i) => (
        <mesh key={`tendril-${i}`} geometry={rt.geometry} frustumCulled={false}>
          <primitive object={rt.material} attach="material" />
        </mesh>
      ))}

      {anchorVectors.map((pos, i) => (
        <mesh
          key={`tendril-attach-${i}`}
          position={pos}
          scale={0.07 + decay * 0.015}
          geometry={attachmentGeometry}
          frustumCulled={false}
        >
          <primitive object={attachmentMaterial} attach="material" />
        </mesh>
      ))}
    </>
  );
};
