# Jellyfish Scene Performance Optimization Spec

## Objective

Achieve **120 FPS** in the jellyfish scene.

**Current baseline: 37.27 FPS** (measured via actual Remotion studio playback)

This is a ~3.2x performance improvement target.

---

## Critical Rules

### Absolute Requirements

1. **NO VISUAL FIDELITY LOSS** — The scene must look identical to the current version
2. **NO DELETIONS** — Do not remove any visual elements (particles, tendrils, seaweed, lighting, effects)
3. **NO QUALITY REDUCTIONS** — Do not reduce geometry detail, shader complexity visible to the eye, particle counts, or any other quality metric
4. **DO NOT STOP** — Continue optimizing until 120 FPS is achieved. This is mandatory.

### What IS Allowed

- GPU-side optimizations (instancing, batching, shared geometries/materials)
- Shader optimizations that produce identical visual output
- Memory optimizations (object pooling, reducing allocations)
- Smarter update patterns (spatial hashing, frustum culling, LOD that's imperceptible)
- Reducing redundant calculations
- Moving CPU work to GPU
- Caching and memoization
- Geometry merging where visually identical
- Using more efficient Three.js APIs

### What is NOT Allowed

- Reducing particle count
- Simplifying geometry in a visible way
- Removing visual effects
- Reducing shader quality
- Removing scene elements
- Making the scene look worse in any way
- Stopping before reaching 120 FPS

---

## Running the Performance Test

From the project root:

```bash
node scripts/perf-test.mjs
```

This:
1. Starts Remotion studio on port 3000
2. Opens headless Chromium to the LiquidCrystal composition
3. Starts playback and measures actual React render FPS
4. Reports steady-state performance (excludes warmup samples)

Output JSON:

```json
{
  "averageFps": 37.27,
  "minFps": 26.27,
  "maxFps": 45.98,
  "samples": [...],
  "sampleCount": 12
}
```

**The target is `averageFps >= 120`**

Note: The Scene component in `src/LiquidCrystal/LiquidCrystal.tsx` has embedded performance tracking that exposes `window.__perfData` for measurement.

---

## Optimization Loop

Follow this cycle until the goal is reached:

```
1. Run performance test → note current FPS
2. Identify bottleneck (GPU render time, CPU updates, geometry rebuilds, etc.)
3. Implement ONE optimization
4. Run performance test → verify improvement AND no visual regression
5. If averageFps < 120, go to step 2
6. If averageFps >= 120, DONE
```

**Do not exit this loop until averageFps >= 120**

---

## Scene Components to Optimize

The test scene (`public/perf-test.html`) contains:

| Component | Description | Optimization Potential |
|-----------|-------------|----------------------|
| JellyfishCore | Sphere with vertex displacement shader (simplex noise) | Shader optimization, reduce noise octaves if imperceptible |
| Particles | 600 points with custom positions | Instancing, GPU-computed positions |
| Tendrils | 14 tube geometries, rebuilt on animation | Geometry caching, vertex shader animation |
| Lighting | Point lights + ambient | Baked lighting if possible |
| Camera | Orbiting animation | Minimal impact |

The actual Remotion scene (`src/LiquidCrystal/`) has additional complexity:

| Component | File | Notes |
|-----------|------|-------|
| JellyfishCore | `JellyfishCore.tsx` | Complex shader with multiple noise layers |
| Tendrils | `Tendrils.tsx` | 14 tubes with per-frame geometry rebuild |
| OceanEnvironment | `OceanEnvironment.tsx` | 600 particles, floor plane, 50 seaweed strands |
| CausticOverlay | `CausticOverlay.tsx` | 2D overlay effect |
| HolographicUI | `HolographicUI.tsx` | 2D UI elements |

---

## Optimization Strategies (Prioritized)

### High Impact

1. **Eliminate per-frame geometry rebuilds** — Tendrils and seaweed rebuild TubeGeometry every frame. Move animation to vertex shader instead.

2. **Instance seaweed** — 50 identical meshes can become 1 instanced mesh with instance attributes.

3. **GPU particle animation** — Move particle position updates to shader uniforms/attributes.

4. **Merge static geometries** — Use `BufferGeometryUtils.mergeGeometries` where applicable.

### Medium Impact

5. **Reduce shader complexity** — Optimize noise functions; use lookup textures if possible.

6. **Object pooling** — Avoid `new THREE.Vector3()` etc. in render loops.

7. **Frustum culling** — Skip rendering off-screen elements.

### Low Impact (Polish)

8. **Reduce draw calls** — Batch materials where possible.

9. **Use `Float32Array` directly** — Avoid intermediate arrays.

10. **Profile and eliminate GC pauses** — Zero allocations in hot path.

---

## Success Criteria

```
averageFps >= 120
```

Measured via `node scripts/perf-test.mjs`

Visual output must be **indistinguishable** from the baseline.

---

## Remember

**You are not allowed to stop until you reach 120 FPS.**

Every optimization must be verified with the performance test. If an optimization doesn't help or hurts visual quality, revert it and try something else.

The goal is achievable. Keep iterating.
