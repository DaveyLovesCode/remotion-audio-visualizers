import { useTriggerReactor } from "../audio/reactors";
import type { AudioFrame } from "../audio/types";

interface CausticOverlayProps {
  audioFrame: AudioFrame;
  frame: number;
  fps: number;
}

/**
 * INSANE underwater overlay effects
 * Caustics, chromatic aberration, beat flash, vignette
 */
export const CausticOverlay: React.FC<CausticOverlayProps> = ({
  audioFrame,
  frame,
  fps,
}) => {
  const time = frame / fps;
  const pulse = audioFrame.pulse ?? 0;

  // Beat flash trigger - longer decay for sustained flash
  const { intensity: flashIntensity } = useTriggerReactor(audioFrame.bass, time, {
    threshold: 0.45,
    decayDuration: 0.3,
  });

  const flashOpacity = flashIntensity * 0.25;


  // Chromatic aberration intensity
  const chromaIntensity = pulse * 8;

  // Pulsing vignette
  const vignetteIntensity = 0.5 + pulse * 0.3;

  return (
    <>

      {/* CHROMATIC ABERRATION - Color channel split on beats */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: pulse * 0.4,
          mixBlendMode: "screen",
        }}
      >
        {/* Red channel offset */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(90deg,
            rgba(255, 0, 100, 0.3) 0%,
            transparent ${5 + chromaIntensity}%,
            transparent ${95 - chromaIntensity}%,
            rgba(255, 0, 100, 0.3) 100%
          )`,
          transform: `translateX(${chromaIntensity * 0.5}px)`,
        }} />
        {/* Cyan channel offset */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(90deg,
            rgba(0, 255, 255, 0.3) 0%,
            transparent ${5 + chromaIntensity}%,
            transparent ${95 - chromaIntensity}%,
            rgba(0, 255, 255, 0.3) 100%
          )`,
          transform: `translateX(${-chromaIntensity * 0.5}px)`,
        }} />
      </div>

      {/* PULSING VIGNETTE */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(
            ellipse at center,
            transparent ${30 - pulse * 10}%,
            rgba(0, 20, 40, ${vignetteIntensity * 0.6}) ${60 - pulse * 5}%,
            rgba(0, 10, 25, ${vignetteIntensity * 0.9}) 100%
          )`,
        }}
      />

      {/* BEAT FLASH - Cyan/white burst */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(
            circle at center,
            rgba(200, 255, 255, ${flashOpacity * 1.5}) 0%,
            rgba(0, 255, 200, ${flashOpacity}) 30%,
            transparent 70%
          )`,
        }}
      />

      {/* CRT scanlines - static fine-grained TV effect */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.12,
          background: `repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 1px,
            rgba(0, 0, 0, 0.3) 1px,
            rgba(0, 0, 0, 0.3) 2px
          )`,
          backgroundSize: "100% 2px",
        }}
      />

      {/* CRT RGB pixel grid - subtle phosphor dots */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.06,
          background: `repeating-linear-gradient(
            90deg,
            rgba(255, 0, 0, 0.15) 0px,
            rgba(0, 255, 0, 0.15) 1px,
            rgba(0, 100, 255, 0.15) 2px,
            transparent 3px
          )`,
          backgroundSize: "3px 100%",
        }}
      />

      {/* CRT vignette - darker edges like old TV */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          boxShadow: "inset 0 0 150px 40px rgba(0, 0, 0, 0.4)",
        }}
      />

      {/* TOP GLOW on beats */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "30%",
          pointerEvents: "none",
          opacity: pulse * 0.4,
          background: `linear-gradient(
            to bottom,
            rgba(0, 255, 200, 0.15),
            transparent
          )`,
        }}
      />

      {/* BOTTOM GLOW */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "40%",
          pointerEvents: "none",
          opacity: 0.3 + pulse * 0.2,
          background: `linear-gradient(
            to top,
            rgba(0, 50, 100, 0.4),
            transparent
          )`,
        }}
      />
    </>
  );
};
