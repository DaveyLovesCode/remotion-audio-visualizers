import { useRef } from "react";
import type { AudioFrame } from "../audio/types";

interface CausticOverlayProps {
  audioFrame: AudioFrame;
  frame: number;
  fps: number;
}

/**
 * CSS-based underwater caustic light effect
 * Subtle rippling light patterns that intensify on beats
 */
export const CausticOverlay: React.FC<CausticOverlayProps> = ({
  audioFrame,
  frame,
  fps,
}) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;

  // Beat flash
  const wasAboveRef = useRef(false);
  const triggerTimeRef = useRef(-999);

  const threshold = 0.45;
  const isAbove = audioFrame.bass > threshold;

  if (isAbove && !wasAboveRef.current) {
    triggerTimeRef.current = time;
    wasAboveRef.current = true;
  } else if (!isAbove) {
    wasAboveRef.current = false;
  }

  const elapsed = time - triggerTimeRef.current;
  const flashIntensity = Math.max(0, 1 - elapsed / 0.2);
  const flashOpacity = flashIntensity * 0.15;

  // Caustic pattern animation
  const causticPhase1 = time * 0.8;
  const causticPhase2 = time * 0.6 + 2;
  const causticScale = 1 + decay * 0.3;

  return (
    <>
      {/* Caustic light patterns */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.15 + decay * 0.1,
          mixBlendMode: "screen",
          background: `
            radial-gradient(
              ellipse at ${50 + Math.sin(causticPhase1) * 20}% ${50 + Math.cos(causticPhase1 * 0.7) * 15}%,
              rgba(0, 200, 180, 0.4) 0%,
              transparent 50%
            ),
            radial-gradient(
              ellipse at ${50 + Math.sin(causticPhase2) * 25}% ${50 + Math.cos(causticPhase2 * 0.8) * 20}%,
              rgba(0, 150, 255, 0.3) 0%,
              transparent 45%
            ),
            radial-gradient(
              ellipse at ${50 + Math.cos(causticPhase1 * 1.2) * 15}% ${50 + Math.sin(causticPhase2 * 0.9) * 25}%,
              rgba(100, 0, 200, 0.2) 0%,
              transparent 40%
            )
          `,
          transform: `scale(${causticScale})`,
        }}
      />

      {/* Vignette - deeper at edges for underwater feel */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(
            ellipse at center,
            transparent 30%,
            rgba(0, 10, 20, 0.5) 70%,
            rgba(0, 5, 15, 0.9) 100%
          )`,
        }}
      />

      {/* Beat flash - cyan tint */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundColor: "#00ffcc",
          opacity: flashOpacity,
        }}
      />
    </>
  );
};
