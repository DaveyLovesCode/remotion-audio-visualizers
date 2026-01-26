import { useMemo, useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { AudioFrame } from "../../audio/types";
import {
  simulationVertexShader,
  simulationFragmentShader,
  renderVertexShader,
  renderFragmentShader,
} from "./shaders";

interface GPUParticlesProps {
  frame: number;
  audioFrame: AudioFrame;
  fps: number;
  count?: number; // Texture dimension (e.g., 256 = 65,536 particles)
}

/**
 * GPU-accelerated particle system using FBO (Frame Buffer Objects)
 *
 * All particle computation runs on the GPU via fragment shaders.
 * Stateless: positions derived from seed + time + audio each frame.
 * Fully deterministic and Remotion-compatible.
 */
export const GPUParticles: React.FC<GPUParticlesProps> = ({
  frame,
  audioFrame,
  fps,
  count = 256,
}) => {
  const { gl, scene, camera } = useThree();
  const time = frame / fps;
  const pointsRef = useRef<THREE.Points>(null);

  // Create all GPU resources once
  const resources = useMemo(() => {
    const size = count;

    // === SEED TEXTURE ===
    const seedData = new Float32Array(size * size * 4);
    const clusterCount = 16;
    const clusters: THREE.Vector3[] = [];

    // Create cluster centers - further from center for background effect
    for (let c = 0; c < clusterCount; c++) {
      const phi = Math.acos(2 * seededRandom(c * 3) - 1);
      const theta = seededRandom(c * 3 + 1) * Math.PI * 2;
      const r = 5 + seededRandom(c * 3 + 2) * 4; // 5-9 units from center
      clusters.push(
        new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        )
      );
    }

    for (let i = 0; i < size * size; i++) {
      const i4 = i * 4;
      const cluster = clusters[Math.floor(seededRandom(i * 7) * clusterCount)];
      // Tighter clustering for flocking effect
      const spread = 0.3 + seededRandom(i * 11) * 0.6;

      seedData[i4 + 0] = cluster.x + (seededRandom(i * 13) - 0.5) * 2 * spread;
      seedData[i4 + 1] = cluster.y + (seededRandom(i * 17) - 0.5) * 2 * spread;
      seedData[i4 + 2] = cluster.z + (seededRandom(i * 19) - 0.5) * 2 * spread;
      seedData[i4 + 3] = seededRandom(i * 23); // Particle ID
    }

    const seedTexture = new THREE.DataTexture(
      seedData,
      size,
      size,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    seedTexture.needsUpdate = true;

    // === FBO FOR SIMULATION OUTPUT ===
    const simulationTarget = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      stencilBuffer: false,
      depthBuffer: false,
    });

    // === SIMULATION SCENE (offscreen) ===
    const simScene = new THREE.Scene();
    const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const simMaterial = new THREE.ShaderMaterial({
      vertexShader: simulationVertexShader,
      fragmentShader: simulationFragmentShader,
      uniforms: {
        uSeedTexture: { value: seedTexture },
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uEnergy: { value: 0 },
        uBeatIntensity: { value: 0 },
      },
    });
    const simMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial);
    simScene.add(simMesh);

    // === PARTICLE GEOMETRY ===
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

    // === RENDER MATERIAL ===
    const renderMaterial = new THREE.ShaderMaterial({
      vertexShader: renderVertexShader,
      fragmentShader: renderFragmentShader,
      uniforms: {
        uPositionTexture: { value: simulationTarget.texture },
        uPointSize: { value: 2.0 },
        uBeatIntensity: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return {
      simScene,
      simCamera,
      simMaterial,
      simulationTarget,
      geometry,
      renderMaterial,
    };
  }, [count]);

  // Run simulation and update uniforms each frame
  // This runs during render which is fine for Remotion's model
  resources.simMaterial.uniforms.uTime.value = time;
  resources.simMaterial.uniforms.uBass.value = audioFrame.bass;
  resources.simMaterial.uniforms.uMid.value = audioFrame.mid;
  resources.simMaterial.uniforms.uHigh.value = audioFrame.high;
  resources.simMaterial.uniforms.uEnergy.value = audioFrame.energy;
  resources.simMaterial.uniforms.uBeatIntensity.value = audioFrame.beatIntensity;

  // Render simulation to FBO
  const currentRenderTarget = gl.getRenderTarget();
  gl.setRenderTarget(resources.simulationTarget);
  gl.clear();
  gl.render(resources.simScene, resources.simCamera);
  gl.setRenderTarget(currentRenderTarget);

  // Update render material uniforms
  resources.renderMaterial.uniforms.uBeatIntensity.value = audioFrame.beatIntensity;
  resources.renderMaterial.uniforms.uTime.value = time;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resources.simulationTarget.dispose();
      resources.geometry.dispose();
      resources.simMaterial.dispose();
      resources.renderMaterial.dispose();
    };
  }, [resources]);

  return (
    <points
      ref={pointsRef}
      geometry={resources.geometry}
      material={resources.renderMaterial}
    />
  );
};

// Deterministic random for consistent particle generation
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
