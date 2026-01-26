import { useMemo, useRef, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useAudioTrigger } from "../audio";
import type { AudioFrame } from "../audio/types";

interface PlanktonProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
  count?: number;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const simulationVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const simulationFragmentShader = /* glsl */ `
  uniform sampler2D uSeedTexture;
  uniform float uTime;
  uniform float uDecay;
  uniform float uDecayPhase;
  uniform vec2 uWaveOrigins[4];
  uniform float uWaveTimes[4];
  uniform int uWaveCount;

  varying vec2 vUv;

  // Simplex noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
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
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    vec4 seed = texture2D(uSeedTexture, vUv);
    vec3 basePos = seed.xyz;
    float particleId = seed.w;

    // === SWIRLING VORTEX MOTION ===
    // Particles orbit around the jellyfish, accelerating on beats
    float orbitSpeed = 0.3 + uDecay * 1.5; // FAST on beats
    float orbitAngle = uTime * orbitSpeed + particleId * 6.28;

    // Apply rotation around Y axis (swirl)
    float dist = length(basePos.xz);
    float currentAngle = atan(basePos.z, basePos.x);
    float newAngle = currentAngle + orbitAngle * (1.0 / (dist * 0.3 + 1.0)); // Closer = faster

    vec3 pos;
    pos.x = cos(newAngle) * dist;
    pos.z = sin(newAngle) * dist;
    pos.y = basePos.y;

    // Turbulent drift
    float driftTime = uTime * 0.3;
    vec3 drift = vec3(
      snoise(vec3(pos.x * 0.4, pos.y * 0.4, driftTime)) * 0.8,
      snoise(vec3(pos.y * 0.4 + 50.0, pos.z * 0.4, driftTime + 100.0)) * 0.6,
      snoise(vec3(pos.z * 0.4 + 100.0, pos.x * 0.4, driftTime + 200.0)) * 0.8
    );
    pos += drift;

    // Vertical bob - more chaotic
    pos.y += sin(uTime * 0.8 + particleId * 10.0) * 0.4;
    pos.y += cos(uTime * 1.2 + particleId * 7.0) * 0.2;

    // === GRAVITATIONAL PULL on beats ===
    // Particles get sucked toward center during high decay
    vec3 toCenter = -normalize(pos);
    float pullStrength = uDecay * uDecay * 1.5;
    float distFromCenter = length(pos);
    // Stronger pull when closer (but not inside jellyfish)
    float pullFactor = pullStrength / (distFromCenter * 0.5 + 0.5);
    pos += toCenter * pullFactor * 0.5;

    // Keep minimum distance from center
    if (length(pos) < 2.0) {
      pos = normalize(pos) * 2.0;
    }

    // === GLOW FROM WAVES ===
    float glow = 0.0;

    // Ambient shimmer - FASTER twinkling
    float twinkle = snoise(vec3(particleId * 100.0, uTime * 4.0, uDecayPhase));
    twinkle = smoothstep(0.5, 1.0, twinkle) * 0.4;
    glow += twinkle;

    // Beat-triggered waves - spherical expansion
    for (int i = 0; i < 4; i++) {
      if (i >= uWaveCount) break;

      float waveTime = uWaveTimes[i];
      float waveRadius = waveTime * 12.0; // FASTER expansion
      float currentDist = length(pos);

      // Wave shell with longer tail
      float shellDist = abs(currentDist - waveRadius);
      float shellWidth = 2.5;
      float shellGlow = smoothstep(shellWidth, 0.0, shellDist);

      // Intensity based on wave age
      float waveIntensity = (1.0 - waveTime / 1.5);
      waveIntensity = max(0.0, waveIntensity);

      glow += shellGlow * waveIntensity * 1.5;
    }

    // Extra glow during high decay (everything lights up)
    glow += uDecay * 0.5;

    glow = min(glow, 2.5);

    gl_FragColor = vec4(pos, glow);
  }
`;

const renderVertexShader = /* glsl */ `
  uniform sampler2D uPositionTexture;
  uniform float uPointSize;

  attribute vec2 aReference;

  varying float vGlow;
  varying float vDepth;

  void main() {
    vec4 posData = texture2D(uPositionTexture, aReference);
    vec3 pos = posData.xyz;
    vGlow = posData.w;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mvPosition.z;

    // Fixed size - glow only affects color/intensity, not size
    gl_PointSize = uPointSize * (80.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 6.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const renderFragmentShader = /* glsl */ `
  uniform float uTime;

  varying float vGlow;
  varying float vDepth;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float dist = length(centered);
    if (dist > 0.5) discard;

    float softEdge = smoothstep(0.5, 0.1, dist);

    // Colors - deep sea bioluminescence
    vec3 dimColor = vec3(0.0, 0.15, 0.2);
    vec3 glowColorA = vec3(0.0, 0.8, 0.6);  // Teal
    vec3 glowColorB = vec3(0.4, 0.2, 1.0);  // Purple
    vec3 brightColor = vec3(0.5, 1.0, 0.8); // Bright cyan

    // Color based on glow intensity
    vec3 color;
    if (vGlow < 0.3) {
      color = mix(dimColor, glowColorA, vGlow / 0.3);
    } else if (vGlow < 1.0) {
      float t = (vGlow - 0.3) / 0.7;
      color = mix(glowColorA, glowColorB, t);
    } else {
      color = mix(glowColorB, brightColor, min((vGlow - 1.0), 1.0));
    }

    // Depth fog
    float fogFar = smoothstep(15.0, 5.0, vDepth);
    float fogNear = smoothstep(1.0, 3.0, vDepth);

    float alpha = softEdge * fogFar * fogNear * (0.2 + vGlow * 0.8);

    gl_FragColor = vec4(color * (1.0 + vGlow * 0.5), alpha);
  }
`;

/**
 * Bioluminescent plankton cloud
 * GPU-computed positions with wave-based glow triggers
 */
export const Plankton: React.FC<PlanktonProps> = ({
  frame,
  audioFrame,
  fps,
  count = 128,
}) => {
  const { gl } = useThree();
  const time = frame / fps;

  const MAX_WAVES = 4;
  const wavesRef = useRef<Array<{ startTime: number }>>([]);
  const lastTimeRef = useRef(-Infinity);

  // Remotion renders frames out of order - reset waves if time went backwards
  if (time < lastTimeRef.current - 0.05) {
    wavesRef.current = [];
  }
  lastTimeRef.current = time;

  // Rising-edge beat detection using centralized hook
  const { justTriggered } = useAudioTrigger({
    value: audioFrame.bass,
    threshold: 0.4,
    time,
    decayDuration: 2.0,
  });

  if (justTriggered) {
    wavesRef.current.push({ startTime: time });
    if (wavesRef.current.length > MAX_WAVES) {
      wavesRef.current.shift();
    }
  }

  // Remove old waves OR future waves (Remotion out-of-order rendering)
  wavesRef.current = wavesRef.current.filter(
    w => w.startTime <= time && time - w.startTime < 2.0
  );

  const resources = useMemo(() => {
    const size = count;

    // Seed texture - distributed in sphere around jellyfish
    const seedData = new Float32Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const i4 = i * 4;
      // Spherical distribution, avoiding center
      const phi = Math.acos(2 * seededRandom(i * 3) - 1);
      const theta = seededRandom(i * 5) * Math.PI * 2;
      const r = 2.5 + seededRandom(i * 7) * 5; // 2.5 to 7.5 units from center

      seedData[i4 + 0] = r * Math.sin(phi) * Math.cos(theta);
      seedData[i4 + 1] = r * Math.sin(phi) * Math.sin(theta) - 1; // Offset down slightly
      seedData[i4 + 2] = r * Math.cos(phi);
      seedData[i4 + 3] = seededRandom(i * 11); // Particle ID
    }

    const seedTexture = new THREE.DataTexture(
      seedData, size, size, THREE.RGBAFormat, THREE.FloatType
    );
    seedTexture.needsUpdate = true;

    // FBO
    const simulationTarget = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      stencilBuffer: false,
      depthBuffer: false,
    });

    // Simulation scene
    const simScene = new THREE.Scene();
    const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const simMaterial = new THREE.ShaderMaterial({
      vertexShader: simulationVertexShader,
      fragmentShader: simulationFragmentShader,
      uniforms: {
        uSeedTexture: { value: seedTexture },
        uTime: { value: 0 },
        uDecay: { value: 0 },
        uDecayPhase: { value: 0 },
        uWaveOrigins: { value: new Float32Array(8) },
        uWaveTimes: { value: new Float32Array(4) },
        uWaveCount: { value: 0 },
      },
    });
    const simMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial);
    simScene.add(simMesh);

    // Particle geometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(size * size * 3);
    const references = new Float32Array(size * size * 2);

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const idx = i * size + j;
        positions[idx * 3] = 0;
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = 0;
        references[idx * 2] = j / (size - 1);
        references[idx * 2 + 1] = i / (size - 1);
      }
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aReference", new THREE.BufferAttribute(references, 2));

    // Render material
    const renderMaterial = new THREE.ShaderMaterial({
      vertexShader: renderVertexShader,
      fragmentShader: renderFragmentShader,
      uniforms: {
        uPositionTexture: { value: simulationTarget.texture },
        uPointSize: { value: 3.0 },
        uTime: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return { simScene, simCamera, simMaterial, simulationTarget, geometry, renderMaterial };
  }, [count]);

  // Pack wave data
  const waveTimes = new Float32Array(4);
  wavesRef.current.forEach((wave, i) => {
    waveTimes[i] = time - wave.startTime;
  });

  // Update uniforms
  resources.simMaterial.uniforms.uTime.value = time;
  resources.simMaterial.uniforms.uDecay.value = audioFrame.pulse ?? 0;
  resources.simMaterial.uniforms.uDecayPhase.value = audioFrame.pulsePhase ?? 0;
  resources.simMaterial.uniforms.uWaveTimes.value = waveTimes;
  resources.simMaterial.uniforms.uWaveCount.value = wavesRef.current.length;

  // Render simulation
  const currentRT = gl.getRenderTarget();
  gl.setRenderTarget(resources.simulationTarget);
  gl.clear();
  gl.render(resources.simScene, resources.simCamera);
  gl.setRenderTarget(currentRT);

  resources.renderMaterial.uniforms.uTime.value = time;

  useEffect(() => {
    return () => {
      resources.simulationTarget.dispose();
      resources.geometry.dispose();
      resources.simMaterial.dispose();
      resources.renderMaterial.dispose();
    };
  }, [resources]);

  return (
    <points geometry={resources.geometry} material={resources.renderMaterial} />
  );
};
