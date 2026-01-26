import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useRef, useState, useEffect } from "react";
import { useAudioAnalysis } from "../audio/useAudioAnalysis";
import type { AudioFrame } from "../audio/types";
import { JellyfishCore } from "./JellyfishCore";
import { Tendrils } from "./Tendrils";
import { OceanEnvironment } from "./OceanEnvironment";
import { CausticOverlay } from "./CausticOverlay";
import { HolographicUI } from "./HolographicUI";

const AUDIO_SRC = staticFile("music.wav");

/**
 * Dynamic camera - orbits with beat-reactive speed and zoom
 */
const UnderwaterCamera: React.FC<{
  frame: number;
  fps: number;
  audioFrame: AudioFrame;
}> = ({ frame, fps, audioFrame }) => {
  const { camera } = useThree();
  const time = frame / fps;

  const decay = audioFrame.decay ?? 0;

  // Accumulated angle for orbit - accelerates on beats
  const angleRef = useRef(0);
  const lastTimeRef = useRef(0);
  const deltaTime = time - lastTimeRef.current;
  const baseSpeed = 0.08;
  const boostSpeed = 1.5;
  angleRef.current += (baseSpeed + decay * boostSpeed) * deltaTime;
  lastTimeRef.current = time;
  const angle = angleRef.current;

  // Zoom - punches in on beats
  const baseRadius = 6;
  const punchIn = decay * 2.0;
  const breathe = Math.sin(time * 0.4) * 0.4;
  const orbitRadius = Math.max(3, baseRadius - punchIn + breathe);

  // Vertical motion
  const verticalSwoop = Math.sin(angle * 0.3) * 1.0;
  const beatLift = decay * 0.6;

  // Subtle shake on beats
  const shakeIntensity = decay * 0.08;
  const shakeX = Math.sin(time * 47) * shakeIntensity;
  const shakeY = Math.cos(time * 53) * shakeIntensity;

  // Subtle dutch angle
  const dutchAngle = Math.sin(time * 0.25) * 0.05 + decay * 0.1;

  const x = Math.sin(angle) * orbitRadius + shakeX;
  const z = Math.cos(angle) * orbitRadius;
  const y = verticalSwoop + beatLift + shakeY;

  // Look at jellyfish center
  const lookY = -0.6 + Math.sin(time * 0.15) * 0.2;

  camera.position.set(x, y, z);
  camera.lookAt(0, lookY, 0);
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
      <UnderwaterCamera frame={frame} fps={fps} audioFrame={audioFrame} />

      {/* Deep underwater lighting */}
      <ambientLight intensity={0.05} color="#001828" />
      <pointLight position={[0, 0, 0]} intensity={1.5} color="#00ffaa" distance={15} />
      <pointLight position={[3, 2, 3]} intensity={0.3} color="#0088ff" />
      <pointLight position={[-3, -2, -3]} intensity={0.2} color="#ff00ff" />

      <OceanEnvironment frame={frame} audioFrame={audioFrame} fps={fps} />
      <JellyfishCore frame={frame} audioFrame={audioFrame} fps={fps} />
      <Tendrils frame={frame} audioFrame={audioFrame} fps={fps} count={14} />
    </>
  );
};

/**
 * Liquid Crystal - Bioluminescent deep sea visualizer
 */
export const LiquidCrystal: React.FC = () => {
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
      <div style={{ width: "100%", height: "100%", backgroundColor: "#000d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#0ff" }}>
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
    <div style={{ backgroundColor: "#000d1a", position: "relative" }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: [0, 0, 7], fov: 55 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
      >
        <Scene frame={frame} fps={fps} audioFrame={audioFrame} />
      </ThreeCanvas>

      <CausticOverlay audioFrame={audioFrame} frame={frame} fps={fps} />
      <HolographicUI audioFrame={audioFrame} frame={frame} fps={fps} />

      <Audio src={AUDIO_SRC} />
    </div>
  );
};
