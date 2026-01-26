import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  CoreGeometry,
  GPUParticles,
  EnergyRings,
  LightBeams,
  FloatingDebris,
  BeatFlash,
} from "./components";
import { useAudioAnalysis } from "./audio/useAudioAnalysis";
import type { AudioFrame } from "./audio/types";
import { useRef, useState, useEffect } from "react";

const AUDIO_SRC = staticFile("music.wav");

/**
 * Shown when no audio file is found in public/
 */
const MissingAudioMessage: React.FC = () => (
  <div
    style={{
      width: "100%",
      height: "100%",
      backgroundColor: "#0a0a0f",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}
  >
    <div style={{ textAlign: "center", color: "#fff", padding: 40 }}>
      <div style={{ fontSize: 48, marginBottom: 24 }}>No Audio File Found</div>
      <div style={{ fontSize: 20, color: "#888", lineHeight: 1.6 }}>
        Add a file named <code style={{ color: "#0ff", background: "#1a1a2e", padding: "2px 8px", borderRadius: 4 }}>music.wav</code> to the <code style={{ color: "#0ff", background: "#1a1a2e", padding: "2px 8px", borderRadius: 4 }}>public/</code> folder
      </div>
    </div>
  </div>
);

/**
 * Camera controller - orbits around the center with subtle movements
 */
const CameraController: React.FC<{
  frame: number;
  fps: number;
  audioFrame: AudioFrame;
}> = ({ frame, fps, audioFrame }) => {
  const { camera } = useThree();
  const time = frame / fps;
  const shakeRef = useRef({ x: 0, y: 0, seed: -1 });

  const orbitRadius = 8;
  const orbitSpeed = 0.08;
  const verticalOscillation = 0.5;

  const angle = time * orbitSpeed;
  const x = Math.sin(angle) * orbitRadius;
  const z = Math.cos(angle) * orbitRadius;
  const y = Math.sin(time * 0.15) * verticalOscillation + 1;

  // Deterministic shake based on frame
  if (shakeRef.current.seed !== frame) {
    const pseudoRandom = (n: number) => {
      const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    shakeRef.current = {
      x: (pseudoRandom(frame) - 0.5) * audioFrame.beatIntensity * 0.15,
      y: (pseudoRandom(frame + 1000) - 0.5) * audioFrame.beatIntensity * 0.15,
      seed: frame,
    };
  }

  const zoomPulse = 1 - audioFrame.bass * 0.05;

  camera.position.set(
    (x + shakeRef.current.x) * zoomPulse,
    y + shakeRef.current.y,
    (z + shakeRef.current.x) * zoomPulse
  );
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  return null;
};

/**
 * Main scene with all visual elements
 */
const Scene: React.FC<{
  frame: number;
  fps: number;
  audioFrame: AudioFrame;
}> = ({ frame, fps, audioFrame }) => {
  return (
    <>
      <CameraController frame={frame} fps={fps} audioFrame={audioFrame} />

      {/* Lighting */}
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 0, 0]} intensity={2} color="#ff00ff" />
      <pointLight position={[5, 5, 5]} intensity={0.5} color="#00ffff" />
      <pointLight position={[-5, -5, 5]} intensity={0.5} color="#ff0080" />

      <GPUParticles frame={frame} audioFrame={audioFrame} fps={fps} count={64} />
      <LightBeams frame={frame} audioFrame={audioFrame} fps={fps} beamCount={16} />
      <EnergyRings frame={frame} audioFrame={audioFrame} fps={fps} />
      <FloatingDebris frame={frame} audioFrame={audioFrame} fps={fps} count={40} />
      <CoreGeometry frame={frame} audioFrame={audioFrame} fps={fps} />
      <BeatFlash frame={frame} audioFrame={audioFrame} fps={fps} />
    </>
  );
};

/**
 * Main Audio Visualizer Composition
 *
 * Uses real frequency extraction from the audio file:
 * - bass (100-500 Hz) drives the core geometry and beat detection
 * - Other bands drive particles, beams, etc.
 */
export const AudioVisualizer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const [audioExists, setAudioExists] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(AUDIO_SRC, { method: "HEAD" })
      .then((res) => setAudioExists(res.ok))
      .catch(() => setAudioExists(false));
  }, []);

  if (audioExists === false) {
    return <MissingAudioMessage />;
  }

  // Real audio frequency extraction
  const { bands, energy, isLoading } = useAudioAnalysis({
    src: AUDIO_SRC,
    bands: [
      { name: "sub", minHz: 20, maxHz: 60 },
      { name: "kick", minHz: 60, maxHz: 150 },
      { name: "bass", minHz: 100, maxHz: 500 }, // Main driver (your requested range)
      { name: "lowMid", minHz: 500, maxHz: 2000 },
      { name: "mid", minHz: 2000, maxHz: 4000 },
      { name: "high", minHz: 4000, maxHz: 12000 },
    ],
    numberOfSamples: 1024, // Faster response
    smoothing: true,
    gate: { floor: 0.35, ceiling: 0.7 },
  });

  // Convert to AudioFrame format for components
  // Bass (100-500 Hz) is the primary driver
  const bassValue = bands.bass ?? 0;
  const prevBassRef = useRef(0);
  const decayRef = useRef(0);
  const decayPhaseRef = useRef(0);

  // Simple beat detection: bass spike above threshold
  const isBeat = bassValue > 0.4 && bassValue > prevBassRef.current * 1.2;
  const beatIntensity = isBeat ? Math.min(1, bassValue * 1.5) : 0;
  prevBassRef.current = bassValue;

  // Decay signal: jumps up with bass, decays smoothly back down
  // This creates the "cushion" effect instead of instant snap-back
  const decayRate = 0.92; // Adjust for faster/slower decay (higher = slower)
  const prevDecay = decayRef.current;
  const decay = Math.max(bassValue, prevDecay * decayRate);
  decayRef.current = decay;

  // Accumulated phase from decay - for evolving/rotating effects
  // Higher decay = faster phase accumulation
  const phaseSpeed = 0.15; // Radians per frame at max decay
  const decayPhase = decayPhaseRef.current + decay * phaseSpeed;
  decayPhaseRef.current = decayPhase;

  const audioFrame: AudioFrame = {
    bass: bassValue,
    lowMid: bands.lowMid ?? 0,
    mid: bands.mid ?? 0,
    highMid: bands.high ?? 0, // Map high to highMid
    high: bands.high ?? 0,
    energy,
    isBeat,
    beatIntensity,
    decay,
    decayPhase,
  };

  return (
    <div style={{ backgroundColor: "#000" }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: [0, 0, 8], fov: 60 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
      >
        <Scene frame={frame} fps={fps} audioFrame={audioFrame} />
      </ThreeCanvas>

      <Audio src={AUDIO_SRC} />
    </div>
  );
};
