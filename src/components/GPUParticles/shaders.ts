// Simulation shader - computes particle positions on GPU
// Stateless: position derived from seed + time + audio (Remotion-compatible)
// Flocking behavior: smooth, cohesive group motion

export const simulationVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const simulationFragmentShader = /* glsl */ `
  uniform sampler2D uSeedTexture;
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uHigh;
  uniform float uEnergy;
  uniform float uBeatIntensity;
  // Multiple concurrent waves
  uniform vec2 uWaveOrigins[6];
  uniform float uWaveTimes[6];
  uniform int uWaveCount;

  varying vec2 vUv;

  // Smooth noise for organic motion
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

  // Smooth 3D flow field for flocking-like motion
  vec3 flowField(vec3 p, float t) {
    // Very slow, smooth noise creates cohesive group motion
    float scale = 0.15;
    float speed = 0.05;

    return vec3(
      snoise(vec3(p.x * scale, p.y * scale, t * speed)),
      snoise(vec3(p.y * scale + 100.0, p.z * scale, t * speed + 50.0)),
      snoise(vec3(p.z * scale + 200.0, p.x * scale, t * speed + 100.0))
    );
  }

  void main() {
    vec4 seed = texture2D(uSeedTexture, vUv);

    vec3 basePos = seed.xyz;
    float particleId = seed.w;

    // Decode properties
    float clusterId = floor(particleId * 16.0);
    float localId = fract(particleId * 16.0);
    float phase = localId * 6.28318;

    // Steady time - no expansion or acceleration
    float morphTime = uTime * 0.08;

    // Get flow direction at this position (shared by nearby particles = flocking)
    vec3 flow = flowField(basePos * 0.5, uTime);

    // Gentle orbital motion around center - accelerated by beats
    float orbitAngle = morphTime * 0.3 + phase;
    mat3 orbitRotation = mat3(
      cos(orbitAngle), 0.0, sin(orbitAngle),
      0.0, 1.0, 0.0,
      -sin(orbitAngle), 0.0, cos(orbitAngle)
    );

    vec3 pos = orbitRotation * basePos;

    // Apply flow field - creates cohesive drifting
    pos += flow * 0.8;

    // Gentle vertical wave - entire clusters move together
    float clusterWave = sin(morphTime + clusterId * 0.5) * 0.4;
    pos.y += clusterWave;

    // Per-particle rotation - keep in 0-2PI range
    float particleRotation = mod(uTime * (0.5 + localId * 2.0) + phase, 6.28318);

    // Keep particles away from center (background element)
    float distFromCenter = length(pos);
    if (distFromCenter < 4.0) {
      pos = normalize(pos) * 4.0;
    }

    // === AMBIENT WAVE - always happening, creates pockets of visibility ===
    // Multiple slow-moving noise-based waves
    float ambient1 = snoise(vec3(pos.x * 0.3, pos.y * 0.3, uTime * 0.15));
    float ambient2 = snoise(vec3(pos.y * 0.2 + 50.0, pos.z * 0.2, uTime * 0.12 + 100.0));
    float ambientWave = (ambient1 + ambient2) * 0.5 + 0.5; // 0-1 range
    ambientWave = smoothstep(0.4, 0.7, ambientWave) * 0.3; // Subtle pockets

    // === BEAT-TRIGGERED WAVES ===
    float beatWaveInfluence = 0.0;

    for (int i = 0; i < 6; i++) {
      if (i >= uWaveCount) break;

      vec2 waveDir = normalize(uWaveOrigins[i]);
      float wavePos = dot(pos.xy, waveDir);
      float waveProgress = uWaveTimes[i] * 75.0; // Fast sweep

      // Distance from wave front (positive = wave has passed this point)
      float frontDist = waveProgress - wavePos - 15.0;

      // Wave shape: fade in at front, long tail behind
      float leading = smoothstep(-3.0, 1.0, frontDist);
      float trailing = smoothstep(12.0, 0.0, frontDist);

      float waveInfluence = leading * trailing;
      beatWaveInfluence += waveInfluence;
    }

    // Clamp beat waves but allow stacking
    beatWaveInfluence = min(beatWaveInfluence, 1.5);

    // Combine: ambient is base, beat waves add on top
    float totalWaveInfluence = ambientWave + beatWaveInfluence;

    // Pack rotation and wave into output
    // xyz = position, w encodes both rotation (0-6.28) and wave (0-2 scaled by 100)
    float encodedData = particleRotation + totalWaveInfluence * 100.0;
    gl_FragColor = vec4(pos, encodedData);
  }
`;

// Render shader - draws particles
export const renderVertexShader = /* glsl */ `
  uniform sampler2D uPositionTexture;
  uniform float uPointSize;
  uniform float uBeatIntensity;

  attribute vec2 aReference;

  varying float vRotation;
  varying float vWaveOpacity;
  varying float vDepth;

  void main() {
    vec4 posData = texture2D(uPositionTexture, aReference);
    vec3 pos = posData.xyz;

    // Decode rotation and wave from packed data
    float encodedData = posData.w;
    vWaveOpacity = encodedData / 100.0; // Can go above 1.0 for additive
    vRotation = mod(encodedData, 100.0);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mvPosition.z;

    // Size grows slightly with wave
    float waveSize = 1.0 + vWaveOpacity * 0.4;
    float size = uPointSize * waveSize;
    gl_PointSize = size * (100.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 0.5, 10.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const renderFragmentShader = /* glsl */ `
  uniform float uBeatIntensity;
  uniform float uTime;

  varying float vRotation;
  varying float vWaveOpacity;
  varying float vDepth;

  void main() {
    // Rotate point coords for per-particle rotation
    vec2 centered = gl_PointCoord - vec2(0.5);
    float c = cos(vRotation);
    float s = sin(vRotation);
    vec2 rotated = vec2(c * centered.x - s * centered.y, s * centered.x + c * centered.y);

    // Soft circular particle with glow
    float dist = length(rotated);
    if (dist > 0.5) discard;

    // Soft edge for glow effect
    float softEdge = smoothstep(0.5, 0.2, dist);

    // Wave intensity - ambient is 0-0.3, beat waves add more
    float waveIntensity = min(vWaveOpacity, 2.0);

    // Colors - barely visible base, intense during beat waves
    vec3 colorBase = vec3(0.15, 0.0, 0.2);   // Very dim purple
    vec3 colorAmbient = vec3(0.3, 0.05, 0.4); // Slightly visible for ambient pockets
    vec3 colorBright = vec3(1.0, 0.5, 1.0);  // Intense magenta for beat waves
    vec3 colorHot = vec3(1.0, 1.0, 1.0);     // Pure white for stacked

    // Multi-stage color based on intensity
    vec3 color;
    if (waveIntensity < 0.3) {
      // Ambient range: barely visible pockets
      color = mix(colorBase, colorAmbient, waveIntensity / 0.3);
    } else if (waveIntensity < 1.3) {
      // Beat wave range - push to bright fast
      float t = (waveIntensity - 0.3) / 1.0;
      color = mix(colorAmbient, colorBright, t * t); // Exponential ramp
    } else {
      // Stacked waves - white hot
      color = mix(colorBright, colorHot, (waveIntensity - 1.3) / 0.7);
    }

    // Depth fade - further = more transparent
    float depthFade = smoothstep(20.0, 5.0, vDepth);

    // Base is barely visible, beat waves are INTENSE
    float alpha;
    if (waveIntensity < 0.3) {
      // Ambient: very subtle
      alpha = depthFade * softEdge * waveIntensity * 0.4;
    } else {
      // Beat waves: maximum intensity
      float beatStrength = (waveIntensity - 0.3);
      alpha = depthFade * softEdge * (0.3 + beatStrength * 2.5);
      color *= 1.0 + beatStrength * 0.5; // Overbright
    }

    gl_FragColor = vec4(color, alpha);
  }
`;
