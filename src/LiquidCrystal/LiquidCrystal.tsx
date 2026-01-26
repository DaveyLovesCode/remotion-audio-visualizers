import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useRef, useState, useEffect, type RefObject } from "react";
import { useAudioAnalysis, usePulseReactor } from "../audio";
import type { AudioFrame } from "../audio";
import { JellyRig } from "./JellyRig";
import { Tendrils } from "./Tendrils";
import { OceanEnvironment } from "./OceanEnvironment";
import { CausticOverlay } from "./CausticOverlay";
import { HolographicUI } from "./HolographicUI";

const AUDIO_SRC = staticFile("music.wav");

/**
 * Orbital camera - swings around the jellyfish with audio-reactive throttle
 * Uses accumulated angle with layered sines for smooth organic wandering
 */
const OrbitalCamera: React.FC<{
  frame: number;
  fps: number;
  audioFrame: AudioFrame;
  targetRef?: RefObject<THREE.Object3D | null>;
}> = ({ frame, fps, audioFrame, targetRef }) => {
  const { camera } = useThree();
  const time = frame / fps;

  const angleRef = useRef(0);
  const lastTimeRef = useRef(0);
  const smoothedTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const tmpTargetRef = useRef(new THREE.Vector3(0, 0, 0));

  const pulse = audioFrame.pulse ?? 0;

  // Reset if Remotion seeks backwards
  if (time < lastTimeRef.current - 0.05) {
    angleRef.current = time * 0.15;
    smoothedTargetRef.current.set(0, 0, 0);
  }

  // Throttle: pulse boosts angular velocity, naturally decays back to base
  const baseSpeed = 0.02;
  const throttleBoost = 1.2;
  const currentSpeed = baseSpeed + pulse * throttleBoost;

  const deltaTime = Math.max(0, time - lastTimeRef.current);
  if (deltaTime > 0 && deltaTime < 0.1) {
    angleRef.current += currentSpeed * deltaTime;
  }
  lastTimeRef.current = time;

  const angle = angleRef.current;

  // Tighter radius - keep jellyfish prominent but not too close
  const baseRadius = 5.0;
  const radiusWander =
    Math.sin(angle * 0.31) * 0.8 +
    Math.sin(angle * 0.13) * 0.4 +
    Math.cos(angle * 0.47) * 0.2;
  const radius = baseRadius + radiusWander; // Range: ~3.6 to ~6.4

  // Height varies faster than orbit for dynamic up/down movement
  // Negative = under the belly looking up, positive = above looking down
  const baseHeight = 0.3;
  const heightWander =
    Math.sin(angle * 0.7) * 2.5 +
    Math.cos(angle * 1.1) * 1.0 +
    Math.sin(angle * 1.7) * 0.5;
  const height = baseHeight + heightWander; // Range: ~-3.7 to ~4.3

  // Orbit wobble - breaks the perfect circle
  const wobbleX = Math.sin(angle * 0.53) * 1.0;
  const wobbleZ = Math.cos(angle * 0.41) * 0.8;

  const x = Math.sin(angle) * radius + wobbleX;
  const z = Math.cos(angle) * radius + wobbleZ;
  const y = height;

  // Subtle dutch angle - must rotateZ AFTER lookAt, not overwrite rotation.z
  const dutchAngle = Math.sin(angle * 0.19) * 0.04 + pulse * 0.03;

  const target = tmpTargetRef.current;
  if (targetRef?.current) {
    targetRef.current.getWorldPosition(target);
  } else {
    target.set(0, 0, 0);
  }

  const smooth = smoothedTargetRef.current;
  if (deltaTime === 0) {
    smooth.copy(target);
  } else {
    const follow = 1 - Math.exp(-deltaTime * 6.0);
    smooth.lerp(target, Math.min(1, Math.max(0, follow)));
  }

  camera.position.set(smooth.x + x, smooth.y + y, smooth.z + z);
  camera.lookAt(smooth.x, smooth.y, smooth.z);
  camera.rotateZ(dutchAngle);

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
  const jellyRootRef = useRef<THREE.Group | null>(null);
  const tendrilAnchorRef = useRef<THREE.Group | null>(null);

  // Performance tracking - expose to window for measurement
  // Track on every render by using frame as dependency
  const perfRef = useRef({ initialized: false });
  if (!perfRef.current.initialized) {
    perfRef.current.initialized = true;
    const w = window as typeof window & { __perfData?: { renderCount: number; lastTime: number; samples: number[]; lastSampleTime: number } };
    w.__perfData = { renderCount: 0, lastTime: performance.now(), samples: [], lastSampleTime: performance.now() };
  }

  // This runs on every render (frame change)
  const w = window as typeof window & { __perfData?: { renderCount: number; lastTime: number; samples: number[]; lastSampleTime: number } };
  if (w.__perfData) {
    const now = performance.now();
    w.__perfData.renderCount++;

    const elapsed = now - w.__perfData.lastSampleTime;
    if (elapsed >= 1000) {
      const fps = (w.__perfData.renderCount * 1000) / elapsed;
      w.__perfData.samples.push(fps);
      if (w.__perfData.samples.length > 30) w.__perfData.samples.shift();
      w.__perfData.renderCount = 0;
      w.__perfData.lastSampleTime = now;
    }
    w.__perfData.lastTime = now;
  }

  return (
    <>
      <OrbitalCamera frame={frame} fps={fps} audioFrame={audioFrame} targetRef={jellyRootRef} />

      {/* Deep underwater lighting - oriented for horizontal swimming */}
      <ambientLight intensity={0.06} color="#001828" />
      {/* Main glow from jellyfish */}
      <pointLight position={[0, 0.3, -0.5]} intensity={1.5} color="#00ffaa" distance={15} />
      {/* Light from ahead (where we're swimming) */}
      <pointLight position={[0, 1, -8]} intensity={0.4} color="#0088ff" />
      {/* Accent from side */}
      <pointLight position={[4, 0, 2]} intensity={0.25} color="#ff00ff" />

      <OceanEnvironment frame={frame} audioFrame={audioFrame} fps={fps} />
      <JellyRig frame={frame} audioFrame={audioFrame} fps={fps} rootRef={jellyRootRef} tendrilAnchorRef={tendrilAnchorRef} />
      <Tendrils frame={frame} audioFrame={audioFrame} fps={fps} count={14} anchorRef={tendrilAnchorRef} />
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

  // Single FFT call - returns both averaged bands AND fill percentages
  // Values tuned via spectrum picker for this specific track
  const { bands, fill, energy, _debug } = useAudioAnalysis({
    src: AUDIO_SRC,
    bands: [
      { name: "kick", minHz: 120, maxHz: 141 },  // Tuned via spectrum picker
      { name: "bass", minHz: 80, maxHz: 250 },
      { name: "lowMid", minHz: 250, maxHz: 2000 },
      { name: "mid", minHz: 2000, maxHz: 4000 },
      { name: "high", minHz: 4000, maxHz: 12000 },
    ],
    numberOfSamples: 4096, // Match spectrum picker
    smoothing: false,
    gate: { floor: 0.2, ceiling: 0.6 },
    fillGate: { floor: 0.89, ceiling: 0.99 }, // Tuned via spectrum picker
    _returnDebug: true,
  });

  // DEBUG: See what values Remotion is actually giving us
  if (frame % 30 === 0 && _debug) {
    console.log(`[DEBUG] frame=${frame} peak=${_debug.kickPeak?.toFixed(3)} fill=${fill.kick?.toFixed(3)}`);
  }

  const time = frame / fps;
  const bassValue = fill.kick ?? 0;
  const prevBassRef = useRef(0);
  const pulsePhaseRef = useRef(0);
  const lastFrameRef = useRef(-1);

  // Remotion renders frames out of order - reset temporal state if frame went backwards
  if (frame < lastFrameRef.current - 1) {
    prevBassRef.current = 0;
    pulsePhaseRef.current = 0;
  }
  lastFrameRef.current = frame;

  // Beat detection
  const isBeat = bassValue > 0.4 && bassValue > prevBassRef.current * 1.2;
  const beatIntensity = isBeat ? Math.min(1, bassValue * 1.5) : 0;
  prevBassRef.current = bassValue;

  // Pulse reactor - envelope follower with decay
  // decay=0.15 gives snappy response, higher = more cushioned
  const pulse = usePulseReactor(bassValue, time, { decay: 0.15 });

  // Accumulated phase from pulse - for evolving/rotating effects
  const phaseSpeed = 0.5;
  const pulsePhase = pulsePhaseRef.current + pulse * phaseSpeed;
  pulsePhaseRef.current = pulsePhase;

  const audioFrame: AudioFrame = {
    bass: bassValue,
    lowMid: bands.lowMid ?? 0,
    mid: bands.mid ?? 0,
    highMid: bands.high ?? 0,
    high: bands.high ?? 0,
    energy,
    isBeat,
    beatIntensity,
    pulse,
    pulsePhase,
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
