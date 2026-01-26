import { useAudioTrigger } from "../audio";
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
  const decay = audioFrame.decay ?? 0;

  // Beat flash trigger
  const { intensity: flashIntensity } = useAudioTrigger({
    value: audioFrame.bass,
    threshold: 0.45,
    time,
    decayDuration: 0.12,
  });

  const flashOpacity = flashIntensity * 0.25;

  // Caustic animation - MORE INTENSE
  const causticPhase1 = time * 1.5;
  const causticPhase2 = time * 1.2 + 2;
  const causticPhase3 = time * 0.8 + 4;
  const causticScale = 1 + decay * 0.15;

  // Chromatic aberration intensity
  const chromaIntensity = decay * 8;

  // Pulsing vignette
  const vignetteIntensity = 0.5 + decay * 0.3;

  return (
    <>
      {/* CAUSTIC LIGHT PATTERNS - Multiple layers */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.2 + decay * 0.25,
          mixBlendMode: "screen",
          background: `
            radial-gradient(
              ellipse at ${50 + Math.sin(causticPhase1) * 30}% ${50 + Math.cos(causticPhase1 * 0.7) * 25}%,
              rgba(0, 255, 200, 0.5) 0%,
              transparent 40%
            ),
            radial-gradient(
              ellipse at ${50 + Math.sin(causticPhase2) * 35}% ${50 + Math.cos(causticPhase2 * 0.8) * 30}%,
              rgba(0, 180, 255, 0.4) 0%,
              transparent 35%
            ),
            radial-gradient(
              ellipse at ${50 + Math.cos(causticPhase3 * 1.2) * 25}% ${50 + Math.sin(causticPhase3 * 0.9) * 35}%,
              rgba(150, 0, 255, 0.3) 0%,
              transparent 30%
            ),
            radial-gradient(
              ellipse at ${50 + Math.cos(causticPhase1 * 0.5) * 40}% ${50 + Math.sin(causticPhase2 * 0.6) * 40}%,
              rgba(0, 255, 150, 0.25) 0%,
              transparent 45%
            )
          `,
          transform: `scale(${causticScale})`,
        }}
      />

      {/* CHROMATIC ABERRATION - Color channel split on beats */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: decay * 0.4,
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
            transparent ${30 - decay * 10}%,
            rgba(0, 20, 40, ${vignetteIntensity * 0.6}) ${60 - decay * 5}%,
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

      {/* FILM GRAIN - Subtle texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.03 + decay * 0.02,
          mixBlendMode: "overlay",
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
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
          opacity: decay * 0.4,
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
          opacity: 0.3 + decay * 0.2,
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
