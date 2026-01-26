import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useRef, useState, useEffect } from "react";
import { useAudioAnalysis } from "../audio/useAudioAnalysis";
import type { AudioFrame } from "../audio/types";
import { CentralVoid } from "./CentralVoid";
import { OrbitingShards } from "./OrbitingShards";
import { GridLines } from "./GridLines";
import { ScanLineOverlay } from "./ScanLineOverlay";

const AUDIO_SRC = staticFile("music.wav");

/**
 * Aggressive camera - zoom punches, dutch angles
 */
const AggressiveCamera: React.FC<{
  frame: number;
  fps: number;
  audioFrame: AudioFrame;
}> = ({ frame, fps, audioFrame }) => {
  const { camera } = useThree();
  const time = frame / fps;

  const decay = audioFrame.decay ?? 0;
  const angleRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Accelerate on beats
  const baseSpeed = 0.06;
  const boostSpeed = 1.5;
  const deltaTime = time - lastTimeRef.current;
  angleRef.current += (baseSpeed + decay * boostSpeed) * deltaTime;
  lastTimeRef.current = time;

  const angle = angleRef.current;

  // Zoom punch on beats
  const baseDistance = 10;
  const punchIn = decay * 2.5;
  const distance = baseDistance - punchIn;

  // Dutch angle - tilts on beats
  const dutchAngle = Math.sin(time * 0.5) * 0.1 + decay * 0.15;

  // Vertical bob
  const y = Math.sin(angle * 0.3) * 1.5 + decay * 0.5;

  const x = Math.sin(angle) * distance;
  const z = Math.cos(angle) * distance;

  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
  camera.rotation.z = dutchAngle;
  camera.updateProjectionMatrix();

  return null;
};

/**
 * Scene composition
 */
const Scene: React.FC<{
  frame: number;
  fps: number;
  audioFrame: AudioFrame;
}> = ({ frame, fps, audioFrame }) => {
  return (
    <>
      <AggressiveCamera frame={frame} fps={fps} audioFrame={audioFrame} />

      {/* Stark industrial lighting */}
      <ambientLight intensity={0.02} />
      <pointLight position={[0, 0, 0]} intensity={0.5} color="#ffffff" />
      <spotLight
        position={[10, 10, 10]}
        intensity={1}
        color="#00ffff"
        angle={0.5}
        penumbra={0.5}
      />
      <spotLight
        position={[-10, -5, -10]}
        intensity={0.8}
        color="#ff00ff"
        angle={0.5}
        penumbra={0.5}
      />

      <CentralVoid frame={frame} audioFrame={audioFrame} fps={fps} />
      <OrbitingShards frame={frame} audioFrame={audioFrame} fps={fps} count={24} />
      <GridLines frame={frame} audioFrame={audioFrame} fps={fps} />
    </>
  );
};

/**
 * Fracture Zone - Industrial geometric void visualizer
 */
export const FractureZone: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const [audioExists, setAudioExists] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(AUDIO_SRC, { method: "HEAD" })
      .then((res) => setAudioExists(res.ok))
      .catch(() => setAudioExists(false));
  }, []);

  if (audioExists === false) {
    return (
      <div style={{ width: "100%", height: "100%", backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center", color: "#0ff" }}>
        No audio file found
      </div>
    );
  }

  // Exact same audio analysis as original AudioVisualizer
  const { bands, energy } = useAudioAnalysis({
    src: AUDIO_SRC,
    bands: [
      { name: "sub", minHz: 20, maxHz: 60 },
      { name: "kick", minHz: 60, maxHz: 150 },
      { name: "bass", minHz: 100, maxHz: 500 }, // Main driver
      { name: "lowMid", minHz: 500, maxHz: 2000 },
      { name: "mid", minHz: 2000, maxHz: 4000 },
      { name: "high", minHz: 4000, maxHz: 12000 },
    ],
    numberOfSamples: 1024,
    smoothing: true,
    gate: { floor: 0.35, ceiling: 0.7 },
  });

  const bassValue = bands.bass ?? 0;
  const prevBassRef = useRef(0);
  const decayRef = useRef(0);
  const decayPhaseRef = useRef(0);

  // Exact same beat detection as original
  const isBeat = bassValue > 0.4 && bassValue > prevBassRef.current * 1.2;
  const beatIntensity = isBeat ? Math.min(1, bassValue * 1.5) : 0;
  prevBassRef.current = bassValue;

  const decayRate = 0.89;
  const decay = Math.max(bassValue, decayRef.current * decayRate);
  decayRef.current = decay;

  const phaseSpeed = 0.5;
  const decayPhase = decayPhaseRef.current + decay * phaseSpeed;
  decayPhaseRef.current = decayPhase;

  const audioFrame: AudioFrame = {
    bass: bassValue,
    lowMid: bands.lowMid ?? 0,
    mid: bands.mid ?? 0,
    highMid: bands.high ?? 0,
    high: bands.high ?? 0,
    energy,
    isBeat,
    beatIntensity,
    decay,
    decayPhase,
  };

  return (
    <div style={{ backgroundColor: "#000000", position: "relative" }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: [0, 0, 10], fov: 65 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.NoToneMapping, // Raw output for harsh look
        }}
      >
        <Scene frame={frame} fps={fps} audioFrame={audioFrame} />
      </ThreeCanvas>

      <ScanLineOverlay audioFrame={audioFrame} frame={frame} fps={fps} />

      <Audio src={AUDIO_SRC} />
    </div>
  );
};
