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
 * Ocean environment - traveling through the deep sea
 * Rushing particles, light streaks, ocean floor, ambient creatures
 */
export const OceanEnvironment: React.FC<OceanEnvironmentProps> = ({
  frame,
  audioFrame,
  fps,
}) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;

  // Accumulated travel distance - constant motion, faster on beats
  const travelRef = useRef(0);
  const lastTimeRef = useRef(0);
  const deltaTime = time - lastTimeRef.current;
  const baseSpeed = 2.0;
  const boostSpeed = 8.0;
  travelRef.current += (baseSpeed + decay * boostSpeed) * deltaTime;
  lastTimeRef.current = time;
  const travel = travelRef.current;

  // Generate rushing particles
  const particleCount = 200;
  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => ({
      x: (seededRandom(i * 3) - 0.5) * 20,
      y: (seededRandom(i * 5) - 0.5) * 15,
      zOffset: seededRandom(i * 7) * 30,
      size: 0.02 + seededRandom(i * 11) * 0.04,
      brightness: 0.3 + seededRandom(i * 13) * 0.7,
    }));
  }, []);

  // Generate light streaks
  const streakCount = 30;
  const streaks = useMemo(() => {
    return Array.from({ length: streakCount }, (_, i) => ({
      x: (seededRandom(i * 17) - 0.5) * 16,
      y: (seededRandom(i * 19) - 0.5) * 12,
      zOffset: seededRandom(i * 23) * 40,
      length: 1 + seededRandom(i * 29) * 3,
      thickness: 0.01 + seededRandom(i * 31) * 0.02,
    }));
  }, []);

  // Ocean floor rocks/formations
  const rockCount = 40;
  const rocks = useMemo(() => {
    return Array.from({ length: rockCount }, (_, i) => ({
      x: (seededRandom(i * 37) - 0.5) * 30,
      zOffset: seededRandom(i * 41) * 50,
      scale: 0.3 + seededRandom(i * 43) * 0.8,
      rotation: seededRandom(i * 47) * Math.PI * 2,
      type: Math.floor(seededRandom(i * 53) * 3), // 0: cone, 1: sphere, 2: box
    }));
  }, []);

  // Particle material
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

          float alpha = smoothstep(0.5, 0.1, dist) * vBrightness * (0.4 + uDecay * 0.4);
          vec3 color = vec3(0.3, 0.8, 0.9) * vBrightness;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);

  particleMaterial.uniforms.uDecay.value = decay;

  // Create particle geometry with positions
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

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('brightness', new THREE.BufferAttribute(brightnesses, 1));

    return geometry;
  }, [particles]);

  // Update particle positions based on travel
  const positionAttr = particleGeometry.attributes.position as THREE.BufferAttribute;
  particles.forEach((p, i) => {
    // Particles rush toward camera (negative Z)
    const loopLength = 30;
    let z = ((p.zOffset - travel) % loopLength);
    if (z > 0) z -= loopLength;
    positionAttr.setZ(i, z);
  });
  positionAttr.needsUpdate = true;

  // Streak material
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
          // Fade at ends
          float fade = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
          float edgeFade = 1.0 - abs(vUv.y - 0.5) * 2.0;

          vec3 color = vec3(0.0, 0.8, 1.0);
          float alpha = fade * edgeFade * (0.3 + uDecay * 0.5);

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

  // Ocean floor material
  const floorMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTravel: { value: 0 },
        uDecay: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;

        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uTravel;
        uniform float uDecay;

        varying vec2 vUv;
        varying vec3 vPosition;

        void main() {
          // Grid pattern that moves with travel
          vec2 gridUv = vUv * 20.0;
          gridUv.y += uTravel * 0.5;

          float gridX = smoothstep(0.02, 0.0, abs(fract(gridUv.x) - 0.5));
          float gridY = smoothstep(0.02, 0.0, abs(fract(gridUv.y) - 0.5));
          float grid = max(gridX, gridY) * 0.3;

          // Distance fade
          float distFade = smoothstep(30.0, 5.0, -vPosition.z);

          // Base color - dark ocean floor
          vec3 baseColor = vec3(0.0, 0.1, 0.15);
          vec3 gridColor = vec3(0.0, 0.4, 0.5);
          vec3 glowColor = vec3(0.0, 0.6, 0.8);

          vec3 color = baseColor + gridColor * grid;
          color += glowColor * grid * uDecay * 0.5;

          float alpha = distFade * (0.4 + grid * 0.3);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  floorMaterial.uniforms.uTime.value = time;
  floorMaterial.uniforms.uTravel.value = travel;
  floorMaterial.uniforms.uDecay.value = decay;

  // Rock material
  const rockMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uDecay: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying float vDepth;

        void main() {
          vNormal = normalMatrix * normal;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uDecay;
        varying vec3 vNormal;
        varying float vDepth;

        void main() {
          // Simple lighting
          vec3 light = normalize(vec3(0.0, 1.0, 0.5));
          float diffuse = max(0.0, dot(vNormal, light)) * 0.5 + 0.5;

          // Distance fade
          float distFade = smoothstep(25.0, 8.0, vDepth);

          vec3 color = vec3(0.05, 0.15, 0.2) * diffuse;
          color += vec3(0.0, 0.3, 0.4) * uDecay * 0.3;

          float alpha = distFade * 0.6;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  rockMaterial.uniforms.uDecay.value = decay;

  return (
    <group>
      {/* Rushing particles */}
      <points geometry={particleGeometry} material={particleMaterial} />

      {/* Light streaks */}
      {streaks.map((streak, i) => {
        const loopLength = 40;
        let z = ((streak.zOffset - travel * 1.5) % loopLength);
        if (z > 0) z -= loopLength;

        // Streak gets longer during beats
        const length = streak.length * (1 + decay * 2);

        return (
          <mesh
            key={`streak-${i}`}
            position={[streak.x, streak.y, z]}
            rotation={[0, 0, 0]}
          >
            <planeGeometry args={[length, streak.thickness * (1 + decay)]} />
            <primitive object={streakMaterial.clone()} attach="material" />
          </mesh>
        );
      })}

      {/* Ocean floor */}
      <mesh position={[0, -8, -15]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 60]} />
        <primitive object={floorMaterial} attach="material" />
      </mesh>

      {/* Floor rocks */}
      {rocks.map((rock, i) => {
        const loopLength = 50;
        let z = ((rock.zOffset - travel * 0.8) % loopLength);
        if (z > 0) z -= loopLength;
        z -= 5; // Offset behind camera start

        const rMat = rockMaterial.clone();
        rMat.uniforms.uDecay.value = decay;

        let geometry;
        switch (rock.type) {
          case 0:
            geometry = <coneGeometry args={[rock.scale * 0.5, rock.scale, 6]} />;
            break;
          case 1:
            geometry = <dodecahedronGeometry args={[rock.scale * 0.4, 0]} />;
            break;
          default:
            geometry = <boxGeometry args={[rock.scale * 0.8, rock.scale * 0.5, rock.scale * 0.6]} />;
        }

        return (
          <mesh
            key={`rock-${i}`}
            position={[rock.x, -7.5 + rock.scale * 0.3, z]}
            rotation={[0, rock.rotation, 0]}
          >
            {geometry}
            <primitive object={rMat} attach="material" />
          </mesh>
        );
      })}

      {/* Ambient glow from below */}
      <pointLight position={[0, -10, -10]} intensity={0.3} color="#004466" distance={30} />
    </group>
  );
};
