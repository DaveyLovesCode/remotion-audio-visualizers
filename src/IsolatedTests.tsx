import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { Audio } from "@remotion/media";
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
import { useRef } from "react";

const AUDIO_SRC = staticFile("music.wav");

// Shared hook for audio analysis
function useAudio() {
  const frame = useCurrentFrame();
  const { bands, energy } = useAudioAnalysis({
    src: AUDIO_SRC,
    bands: [
      { name: "bass", minHz: 100, maxHz: 500 },
      { name: "lowMid", minHz: 500, maxHz: 2000 },
      { name: "mid", minHz: 2000, maxHz: 4000 },
      { name: "high", minHz: 4000, maxHz: 12000 },
    ],
    numberOfSamples: 1024,
    smoothing: false,
  });

  const bassValue = bands.bass ?? 0;
  const prevBassRef = useRef(0);
  const isBeat = bassValue > 0.4 && bassValue > prevBassRef.current * 1.2;
  const beatIntensity = isBeat ? Math.min(1, bassValue * 1.5) : 0;
  prevBassRef.current = bassValue;

  const audioFrame: AudioFrame = {
    bass: bassValue,
    lowMid: bands.lowMid ?? 0,
    mid: bands.mid ?? 0,
    highMid: bands.high ?? 0,
    high: bands.high ?? 0,
    energy,
    isBeat,
    beatIntensity,
  };

  return audioFrame;
}

// Shared wrapper for isolated tests
const IsolatedWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { width, height } = useVideoConfig();

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
        <ambientLight intensity={0.2} />
        <pointLight position={[0, 0, 0]} intensity={2} color="#ff00ff" />
        {children}
      </ThreeCanvas>
      <Audio src={AUDIO_SRC} />
    </div>
  );
};

// === ISOLATED TEST COMPOSITIONS ===

export const Test_CoreGeometry: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioFrame = useAudio();

  return (
    <IsolatedWrapper>
      <CoreGeometry frame={frame} audioFrame={audioFrame} fps={fps} />
    </IsolatedWrapper>
  );
};

export const Test_GPUParticles: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioFrame = useAudio();

  return (
    <IsolatedWrapper>
      <GPUParticles frame={frame} audioFrame={audioFrame} fps={fps} count={64} />
    </IsolatedWrapper>
  );
};

export const Test_LightBeams: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioFrame = useAudio();

  return (
    <IsolatedWrapper>
      <LightBeams frame={frame} audioFrame={audioFrame} fps={fps} beamCount={16} />
    </IsolatedWrapper>
  );
};

export const Test_EnergyRings: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioFrame = useAudio();

  return (
    <IsolatedWrapper>
      <EnergyRings frame={frame} audioFrame={audioFrame} fps={fps} />
    </IsolatedWrapper>
  );
};

export const Test_FloatingDebris: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioFrame = useAudio();

  return (
    <IsolatedWrapper>
      <FloatingDebris frame={frame} audioFrame={audioFrame} fps={fps} count={40} />
    </IsolatedWrapper>
  );
};

export const Test_BeatFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioFrame = useAudio();

  return (
    <IsolatedWrapper>
      <BeatFlash frame={frame} audioFrame={audioFrame} fps={fps} />
    </IsolatedWrapper>
  );
};
