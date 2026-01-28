import { useRef, useEffect, useState, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWebAudio } from "./audio/useWebAudio";
import type { AudioFrame } from "./audio/types";
import { Scene } from "./LiquidCrystal/Scene";
import { CausticOverlay } from "./LiquidCrystal/CausticOverlay";
import { HolographicUI } from "./LiquidCrystal/HolographicUI";

const FPS = 60;

// Shared state that updates every frame without React re-renders
const sharedState = {
  time: 0,
  frame: 0,
  audioFrame: {
    bass: 0,
    lowMid: 0,
    mid: 0,
    highMid: 0,
    high: 0,
    energy: 0,
    isBeat: false,
    beatIntensity: 0,
    pulse: 0,
    pulsePhase: 0,
  } as AudioFrame,
};

// Inner component that runs inside Canvas and uses useFrame
const SceneWrapper: React.FC = () => {
  const frameRef = useRef(0);

  useFrame((_, delta) => {
    // Update shared state continuously
    sharedState.time += delta;
    sharedState.frame = Math.floor(sharedState.time * FPS);
    frameRef.current = sharedState.frame;
  });

  // Force re-render on each frame by reading the ref
  const frame = frameRef.current;

  return (
    <Scene
      frame={sharedState.frame}
      fps={FPS}
      audioFrame={sharedState.audioFrame}
    />
  );
};

export const App: React.FC = () => {
  const [, forceUpdate] = useState(0);
  const prevBassRef = useRef(0);
  const pulseRef = useRef(0);
  const pulsePhaseRef = useRef(0);
  const lastTimeRef = useRef(0);

  const { bands, fill, energy, isPlaying, toggle } = useWebAudio({
    src: "/music.wav",
    bands: [
      { name: "kick", minHz: 120, maxHz: 141 },
      { name: "bass", minHz: 80, maxHz: 250 },
      { name: "lowMid", minHz: 250, maxHz: 2000 },
      { name: "mid", minHz: 2000, maxHz: 4000 },
      { name: "high", minHz: 4000, maxHz: 12000 },
    ],
    fftSize: 4096,
    gate: { floor: 0.2, ceiling: 0.6 },
    fillGate: { floor: 0.89, ceiling: 0.99 },
    visualLeadTime: 0.05, // visuals react 50ms ahead of audio
  });

  // Update audio frame data and overlays at 60fps
  useEffect(() => {
    let animationId: number;

    const tick = () => {
      const time = sharedState.time;
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;

      const bassValue = fill.kick ?? 0;

      // Beat detection
      const isBeat = bassValue > 0.4 && bassValue > prevBassRef.current * 1.2;
      const beatIntensity = isBeat ? Math.min(1, bassValue * 1.5) : 0;
      prevBassRef.current = bassValue;

      // Pulse decay (envelope follower)
      const decay = 0.55;
      const decayRate = 1 - Math.pow(1 - decay, 3);
      const retain = Math.pow(decayRate, dt * 60);
      pulseRef.current = Math.max(bassValue, pulseRef.current * retain);

      // Phase accumulation
      pulsePhaseRef.current += pulseRef.current * 0.5 * dt;

      // Update shared audio frame
      sharedState.audioFrame = {
        bass: bassValue,
        lowMid: bands.lowMid ?? 0,
        mid: bands.mid ?? 0,
        highMid: bands.high ?? 0,
        high: bands.high ?? 0,
        energy,
        isBeat,
        beatIntensity,
        pulse: pulseRef.current,
        pulsePhase: pulsePhaseRef.current,
      };

      // Force overlay re-render
      forceUpdate((n) => n + 1);
      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [bands, fill, energy]);

  const handleClick = useCallback(() => {
    toggle();
  }, [toggle]);

  // Spacebar play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  return (
    <div
      style={{ width: "100%", height: "100%", backgroundColor: "#000d1a", position: "relative", cursor: "pointer" }}
      onClick={handleClick}
    >
      <Canvas
        camera={{ position: [0, 0, 7], fov: 55 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
      >
        <SceneWrapper />
      </Canvas>

      <CausticOverlay audioFrame={sharedState.audioFrame} frame={sharedState.frame} fps={FPS} />
      <HolographicUI audioFrame={sharedState.audioFrame} frame={sharedState.frame} fps={FPS} />

      {/* Play prompt */}
      {!isPlaying && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "rgba(0, 220, 180, 0.8)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "24px",
            letterSpacing: "4px",
            pointerEvents: "none",
          }}
        >
          CLICK TO START
        </div>
      )}
    </div>
  );
};
