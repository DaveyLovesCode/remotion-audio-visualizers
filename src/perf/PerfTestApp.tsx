import { useRef, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";
import { JellyfishCore } from "../LiquidCrystal/JellyfishCore";
import { Tendrils } from "../LiquidCrystal/Tendrils";
import { OceanEnvironment } from "../LiquidCrystal/OceanEnvironment";
import { CausticOverlay } from "../LiquidCrystal/CausticOverlay";
import { HolographicUI } from "../LiquidCrystal/HolographicUI";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 120;

// FPS tracking exposed to window for measurement
interface PerfData {
  samples: number[];
  lastSampleTime: number;
  frameCount: number;
  measuring: boolean;
  done: boolean;
  result: {
    averageFps: number;
    minFps: number;
    maxFps: number;
    samples: number[];
    sampleCount: number;
  } | null;
}

declare global {
  interface Window {
    __fpsData: PerfData;
  }
}

// Initialize perf tracking
if (typeof window !== "undefined") {
  window.__fpsData = {
    samples: [],
    lastSampleTime: performance.now(),
    frameCount: 0,
    measuring: true,
    done: false,
    result: null,
  };
}

/**
 * Generate mock audio data using sine waves (simulates music reactivity)
 */
function generateMockAudioFrame(time: number): AudioFrame {
  // Simulated bass pulse - like a kick drum every ~0.5s
  const bassBase = Math.sin(time * Math.PI * 4) * 0.5 + 0.5;
  const bassSpike = Math.pow(bassBase, 3); // Sharp peaks
  const bass = bassSpike * 0.8;

  // Mid frequencies - slower modulation
  const mid = Math.sin(time * 2.1 + 1) * 0.3 + 0.4;
  const lowMid = Math.sin(time * 1.7 + 2) * 0.25 + 0.35;
  const highMid = Math.sin(time * 3.3 + 0.5) * 0.2 + 0.3;
  const high = Math.sin(time * 4.7 + 1.2) * 0.15 + 0.25;

  // Energy is overall loudness
  const energy = (bass + mid + lowMid) / 3;

  // Beat detection - trigger on bass peaks
  const isBeat = bass > 0.5 && bassBase > 0.9;
  const beatIntensity = isBeat ? bass : 0;

  return {
    bass,
    lowMid,
    mid,
    highMid,
    high,
    energy,
    isBeat,
    beatIntensity,
  };
}

/**
 * Orbital camera matching LiquidCrystal.tsx behavior
 */
const OrbitalCamera: React.FC<{
  time: number;
  decay: number;
}> = ({ time, decay }) => {
  const angleRef = useRef(0);
  const lastTimeRef = useRef(0);

  useFrame(({ camera }) => {
    // Reset if time went backwards
    if (time < lastTimeRef.current - 0.05) {
      angleRef.current = time * 0.15;
    }

    const baseSpeed = 0.02;
    const throttleBoost = 1.2;
    const currentSpeed = baseSpeed + decay * throttleBoost;

    const deltaTime = Math.max(0, time - lastTimeRef.current);
    if (deltaTime > 0 && deltaTime < 0.1) {
      angleRef.current += currentSpeed * deltaTime;
    }
    lastTimeRef.current = time;

    const angle = angleRef.current;

    const baseRadius = 5.0;
    const radiusWander =
      Math.sin(angle * 0.31) * 0.8 +
      Math.sin(angle * 0.13) * 0.4 +
      Math.cos(angle * 0.47) * 0.2;
    const radius = baseRadius + radiusWander;

    const baseHeight = 0.3;
    const heightWander =
      Math.sin(angle * 0.7) * 2.5 +
      Math.cos(angle * 1.1) * 1.0 +
      Math.sin(angle * 1.7) * 0.5;
    const height = baseHeight + heightWander;

    const wobbleX = Math.sin(angle * 0.53) * 1.0;
    const wobbleZ = Math.cos(angle * 0.41) * 0.8;

    const x = Math.sin(angle) * radius + wobbleX;
    const z = Math.cos(angle) * radius + wobbleZ;
    const y = height;

    const dutchAngle = Math.sin(angle * 0.19) * 0.04 + decay * 0.03;

    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    camera.rotateZ(dutchAngle);
  });

  return null;
};

/**
 * Main 3D scene with all components
 */
const Scene: React.FC<{
  frame: number;
  fps: number;
  audioFrame: AudioFrame;
}> = ({ frame, fps, audioFrame }) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;

  return (
    <>
      <OrbitalCamera time={time} decay={decay} />

      {/* Lighting - matches LiquidCrystal.tsx */}
      <ambientLight intensity={0.06} color="#001828" />
      <pointLight position={[0, 0.3, -0.5]} intensity={1.5} color="#00ffaa" distance={15} />
      <pointLight position={[0, 1, -8]} intensity={0.4} color="#0088ff" />
      <pointLight position={[4, 0, 2]} intensity={0.25} color="#ff00ff" />

      {/* Real scene components */}
      <OceanEnvironment frame={frame} audioFrame={audioFrame} fps={fps} />
      <JellyfishCore frame={frame} audioFrame={audioFrame} fps={fps} />
      <Tendrils frame={frame} audioFrame={audioFrame} fps={fps} count={14} />
    </>
  );
};

/**
 * Performance Test Application
 * Renders the full jellyfish scene without Remotion
 */
export const PerfTestApp: React.FC = () => {
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const prevBassRef = useRef(0);
  const decayRef = useRef(0);
  const decayPhaseRef = useRef(0);

  // Animation loop - measures actual frame render times for accurate FPS calculation
  useEffect(() => {
    let running = true;
    let lastFrameTime = performance.now();
    const frameTimes: number[] = [];

    const animate = () => {
      if (!running) return;

      const now = performance.now();
      const frameTime = now - lastFrameTime;
      lastFrameTime = now;

      // Track frame times for FPS calculation
      if (frameTime > 0 && frameTime < 500) { // Ignore outliers
        frameTimes.push(frameTime);
        // Keep last 100 frame times
        if (frameTimes.length > 100) {
          frameTimes.shift();
        }
      }

      if (startTimeRef.current === null) {
        startTimeRef.current = now;
      }

      // Update frame for rendering
      frameRef.current++;
      setFrame(frameRef.current);

      // FPS tracking - compute from frame times every second
      if (window.__fpsData && window.__fpsData.measuring) {
        window.__fpsData.frameCount++;
        const sampleElapsed = now - window.__fpsData.lastSampleTime;

        if (sampleElapsed >= 1000 && frameTimes.length >= 10) {
          // Calculate FPS from average frame time
          const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
          const fps = 1000 / avgFrameTime;

          window.__fpsData.samples.push(Math.round(fps * 100) / 100);
          window.__fpsData.frameCount = 0;
          window.__fpsData.lastSampleTime = now;
          frameTimes.length = 0; // Clear for next sample

          // Keep last 30 samples
          if (window.__fpsData.samples.length > 30) {
            window.__fpsData.samples.shift();
          }
        }
      }

      // Use requestAnimationFrame for timing - actual FPS calculated from frame times
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
    return () => { running = false; };
  }, []);

  // Generate audio data with decay
  const time = frame / FPS;
  const baseAudio = generateMockAudioFrame(time);

  // Decay computation (matches LiquidCrystal.tsx)
  const decayRate = 0.89;
  const decay = Math.max(baseAudio.bass, decayRef.current * decayRate);
  decayRef.current = decay;

  const phaseSpeed = 0.5;
  const decayPhase = decayPhaseRef.current + decay * phaseSpeed;
  decayPhaseRef.current = decayPhase;

  prevBassRef.current = baseAudio.bass;

  const audioFrame: AudioFrame = {
    ...baseAudio,
    decay,
    decayPhase,
  };

  return (
    <div style={{ width: WIDTH, height: HEIGHT, backgroundColor: "#000d1a", position: "relative" }}>
      <Canvas
        camera={{ position: [0, 0, 7], fov: 55 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
        style={{ width: WIDTH, height: HEIGHT }}
      >
        <Scene frame={frame} fps={FPS} audioFrame={audioFrame} />
      </Canvas>

      {/* 2D overlays - real components */}
      <CausticOverlay audioFrame={audioFrame} frame={frame} fps={FPS} />
      <HolographicUI audioFrame={audioFrame} frame={frame} fps={FPS} />

      {/* Status display */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          color: "#0ff",
          fontFamily: "monospace",
          fontSize: "14px",
          zIndex: 1000,
          background: "rgba(0,0,0,0.7)",
          padding: "8px 16px",
          borderRadius: "4px",
        }}
      >
        Frame: {frame} | FPS Samples: {window.__fpsData?.samples.length ?? 0}
        {window.__fpsData?.samples.length > 0 && (
          <> | Avg: {(window.__fpsData.samples.reduce((a, b) => a + b, 0) / window.__fpsData.samples.length).toFixed(1)}</>
        )}
      </div>
    </div>
  );
};
