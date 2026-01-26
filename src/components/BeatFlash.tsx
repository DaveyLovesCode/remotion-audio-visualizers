import { useRef } from "react";
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
  const wasAboveRef = useRef(false);
  const triggerTimeRef = useRef(-999);

  // Rising-edge trigger
  const threshold = 0.5;
  const isAbove = audioFrame.bass > threshold;

  if (isAbove && !wasAboveRef.current) {
    triggerTimeRef.current = time;
    wasAboveRef.current = true;
  } else if (!isAbove) {
    wasAboveRef.current = false;
  }

  // Mild decay from trigger
  const elapsed = time - triggerTimeRef.current;
  const decayDuration = 0.15; // seconds
  const intensity = Math.max(0, 1 - elapsed / decayDuration);
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
