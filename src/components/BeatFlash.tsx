import { useAudioTrigger } from "../audio";
import type { AudioFrame } from "../audio/types";

interface BeatFlashProps {
  audioFrame: AudioFrame;
  frame: number;
  fps: number;
}

/**
 * Full-screen strobe overlay - triggers on beat, decays quickly
 */
export const BeatFlash: React.FC<BeatFlashProps> = ({ audioFrame, frame, fps }) => {
  const time = frame / fps;

  const { intensity } = useAudioTrigger({
    value: audioFrame.bass,
    threshold: 0.5,
    time,
    decayDuration: 0.15,
  });

  const opacity = intensity * 0.35;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#ffe0ec",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};
