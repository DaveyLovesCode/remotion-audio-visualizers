import { useRef } from "react";
import { useAudioTrigger } from "../audio";
import type { AudioFrame } from "../audio/types";

interface ScanLineOverlayProps {
  audioFrame: AudioFrame;
  frame: number;
  fps: number;
}

/**
 * Industrial overlay effects:
 * - Horizontal scan lines sweeping on beats
 * - Subtle CRT-style scanlines
 * - Harsh vignette
 * - Beat flash
 */
export const ScanLineOverlay: React.FC<ScanLineOverlayProps> = ({
  audioFrame,
  frame,
  fps,
}) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;

  // Beat flash using centralized trigger
  const { intensity: flashIntensity, justTriggered } = useAudioTrigger({
    value: audioFrame.bass,
    threshold: 0.5,
    time,
    decayDuration: 0.08,
  });
  const flashOpacity = flashIntensity * 0.4;

  // Beat-triggered scan lines
  const MAX_SCANS = 3;
  const scansRef = useRef<Array<{ startTime: number; direction: number }>>([]);
  const lastTimeRef = useRef(-Infinity);

  // Remotion renders frames out of order - reset if time went backwards
  if (time < lastTimeRef.current - 0.05) {
    scansRef.current = [];
  }
  lastTimeRef.current = time;

  // Add scan on trigger
  if (justTriggered) {
    scansRef.current.push({
      startTime: time,
      direction: Math.random() > 0.5 ? 1 : -1,
    });
    if (scansRef.current.length > MAX_SCANS) {
      scansRef.current.shift();
    }
  }

  // Remove old scans OR future scans (Remotion out-of-order rendering)
  scansRef.current = scansRef.current.filter(
    s => s.startTime <= time && time - s.startTime < 0.4
  );

  return (
    <>
      {/* CRT scanlines - always visible */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.08,
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.5) 2px,
            rgba(0, 0, 0, 0.5) 4px
          )`,
        }}
      />

      {/* Sweep scan lines */}
      {scansRef.current.map((scan, i) => {
        const elapsed = time - scan.startTime;
        const progress = elapsed / 0.3; // 0.3 second sweep
        const yPos = scan.direction > 0 ? progress * 100 : (1 - progress) * 100;
        const opacity = (1 - progress) * 0.8;
        const height = 4 + decay * 8;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${yPos}%`,
              height: `${height}px`,
              pointerEvents: "none",
              background: `linear-gradient(
                ${scan.direction > 0 ? "to bottom" : "to top"},
                transparent,
                rgba(0, 255, 255, ${opacity}),
                rgba(255, 255, 255, ${opacity * 1.5}),
                rgba(0, 255, 255, ${opacity}),
                transparent
              )`,
              boxShadow: `0 0 20px rgba(0, 255, 255, ${opacity * 0.5})`,
            }}
          />
        );
      })}

      {/* Chromatic aberration on beats - offset color channels */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: decay * 0.15,
          mixBlendMode: "screen",
          background: `linear-gradient(
            90deg,
            rgba(255, 0, 0, 0.3) 0%,
            transparent 3%,
            transparent 97%,
            rgba(0, 255, 255, 0.3) 100%
          )`,
        }}
      />

      {/* Hard vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(
            ellipse at center,
            transparent 40%,
            rgba(0, 0, 0, 0.6) 80%,
            rgba(0, 0, 0, 0.95) 100%
          )`,
        }}
      />

      {/* Beat flash - white with slight cyan */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundColor: "#eeffff",
          opacity: flashOpacity,
        }}
      />

      {/* Corner glitch blocks on beats */}
      {decay > 0.3 && (
        <>
          <div
            style={{
              position: "absolute",
              top: "5%",
              right: "3%",
              width: `${20 + decay * 60}px`,
              height: `${3 + decay * 5}px`,
              backgroundColor: decay > 0.6 ? "#ff00ff" : "#00ffff",
              opacity: decay * 0.8,
              mixBlendMode: "screen",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "8%",
              left: "5%",
              width: `${15 + decay * 40}px`,
              height: `${2 + decay * 4}px`,
              backgroundColor: decay > 0.6 ? "#00ffff" : "#ff00ff",
              opacity: decay * 0.6,
              mixBlendMode: "screen",
            }}
          />
        </>
      )}
    </>
  );
};
