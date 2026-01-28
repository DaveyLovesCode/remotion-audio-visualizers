import type { AudioFrame } from "../audio/types";

// Generate a wave path with fixed endpoints - wave travels along the line
function generateWavePath(
  width: number,
  centerY: number,
  amplitude: number,
  frequency: number,
  phase: number,
  points: number = 80
): string {
  const step = width / points;
  let path = `M 0 ${centerY}`;

  for (let i = 1; i <= points; i++) {
    const t = i / points;
    const x = i * step;
    const envelope = Math.sin(t * Math.PI);
    const wavePhase = phase - t * Math.PI * 2 * frequency;
    const y = centerY + Math.sin(wavePhase) * amplitude * envelope;
    path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }

  return path;
}

interface HolographicUIProps {
  audioFrame: AudioFrame;
  frame: number;
  fps: number;
}

const SYSTEM_MESSAGES = [
  "NEURAL LINK ACTIVE",
  "DEPTH SCANNER ONLINE",
  "BIOLUMINESCENCE DETECTED",
  "SIGNAL ACQUIRED",
  "ANOMALY TRACKING",
  "FREQUENCY LOCKED",
  "SYSTEM NOMINAL",
  "PULSE DETECTED",
];


export const HolographicUI: React.FC<HolographicUIProps> = ({
  audioFrame,
  frame,
  fps,
}) => {
  const time = frame / fps;
  const pulse = audioFrame.pulse ?? 0;

  // Subtle breathing motion
  const breathe = Math.sin(time * 0.4) * 2 + pulse * 3;

  // Typing effect for system messages
  const typeSpeed = 8;
  const messageIndex = Math.floor(time / 4) % SYSTEM_MESSAGES.length;
  const currentMessage = SYSTEM_MESSAGES[messageIndex];
  const messageTime = time % 4;
  const charsToShow = Math.min(currentMessage.length, Math.floor(messageTime * typeSpeed));
  const displayMessage = currentMessage.substring(0, charsToShow);

  // Data values - mirrors ocean travel speed for display
  const baseSpeed = 5.0;
  const boostSpeed = 80.0;
  const currentSpeed = baseSpeed + pulse * boostSpeed;
  const speedDisplay = currentSpeed.toFixed(1);
  const depthValue = (10994 + Math.sin(time * 0.3) * 50).toFixed(0);

  // Bow dimensions - fixed width, centered
  const bowWidth = 800;
  const bowHeight = 12;

  // Color scheme - softer cyan
  const primaryColor = `rgba(0, 220, 180, ${0.5 + pulse * 0.3})`;
  const dimColor = `rgba(0, 220, 180, 0.25)`;
  const veryDimColor = `rgba(0, 220, 180, 0.12)`;

  return (
    <>
      {/* TOP BOW - fixed width, centered */}
      <svg
        style={{
          position: "absolute",
          top: 28,
          left: "50%",
          transform: `translateX(-50%) translateY(${breathe * 0.3}px)`,
          overflow: "visible",
          pointerEvents: "none",
        }}
        width={bowWidth}
        height={40}
      >
        <path
          d={`M 0 0 Q ${bowWidth / 2} ${bowHeight} ${bowWidth} 0`}
          fill="none"
          stroke={primaryColor}
          strokeWidth="1.5"
        />
        {/* Secondary parallel bow */}
        <path
          d={`M ${bowWidth * 0.15} -8 Q ${bowWidth / 2} ${bowHeight * 0.6 - 8} ${bowWidth * 0.85} -8`}
          fill="none"
          stroke={dimColor}
          strokeWidth="1"
        />
      </svg>

      {/* TOP LEFT - horizontal */}
      <div
        style={{
          position: "absolute",
          top: 52,
          left: "8%",
          fontFamily: "'JetBrains Mono', monospace",
          transform: `translateY(${breathe * 0.5}px)`,
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: "17px", color: dimColor, letterSpacing: "4px", marginBottom: "9px" }}>
          SYSTEM
        </div>
        <div style={{ fontSize: "24px", color: primaryColor, letterSpacing: "1.5px", whiteSpace: "nowrap" }}>
          {displayMessage}
          <span style={{ opacity: Math.sin(time * 8) > 0 ? 1 : 0 }}>_</span>
        </div>
      </div>

      {/* TOP CENTER - speed display at apex of bow */}
      <div
        style={{
          position: "absolute",
          top: 48,
          left: "50%",
          transform: `translateX(-50%) translateY(${breathe * 0.3}px)`,
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: "28px", fontWeight: "300", color: primaryColor, letterSpacing: "2px" }}>
          {speedDisplay}
          <span style={{ fontSize: "12px", opacity: 0.5, marginLeft: "4px" }}>m/s</span>
        </div>
      </div>

      {/* TOP RIGHT - full circle radial gauge */}
      <div
        style={{
          position: "absolute",
          top: 48,
          right: "8%",
          fontFamily: "'JetBrains Mono', monospace",
          transform: `translateY(${breathe * 0.5}px)`,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div style={{ fontSize: "17px", color: dimColor, letterSpacing: "4px" }}>
          BIOLUM
        </div>
        <svg width="54" height="54" style={{ overflow: "visible" }}>
          {/* Background circle */}
          <circle
            cx="27"
            cy="27"
            r="21"
            fill="none"
            stroke={veryDimColor}
            strokeWidth="3.75"
          />
          {/* Filled arc based on pulse - starts from top */}
          <circle
            cx="27"
            cy="27"
            r="21"
            fill="none"
            stroke={primaryColor}
            strokeWidth="3.75"
            strokeLinecap="round"
            strokeDasharray={`${pulse * 131.95} 131.95`}
            transform="rotate(-90 27 27)"
          />
        </svg>
      </div>

      {/* BOTTOM BOW - fixed width, centered */}
      <svg
        style={{
          position: "absolute",
          bottom: 28,
          left: "50%",
          transform: `translateX(-50%) translateY(${-breathe * 0.3}px)`,
          overflow: "visible",
          pointerEvents: "none",
        }}
        width={bowWidth}
        height={40}
      >
        <path
          d={`M 0 40 Q ${bowWidth / 2} ${40 - bowHeight} ${bowWidth} 40`}
          fill="none"
          stroke={primaryColor}
          strokeWidth="1.5"
        />
        {/* Secondary parallel bow */}
        <path
          d={`M ${bowWidth * 0.15} 48 Q ${bowWidth / 2} ${48 - bowHeight * 0.6} ${bowWidth * 0.85} 48`}
          fill="none"
          stroke={dimColor}
          strokeWidth="1"
        />
      </svg>

      {/* BOTTOM LEFT - horizontal */}
      <div
        style={{
          position: "absolute",
          bottom: 52,
          left: "8%",
          fontFamily: "'JetBrains Mono', monospace",
          transform: `translateY(${-breathe * 0.5}px)`,
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: "17px", color: dimColor, letterSpacing: "4px", marginBottom: "9px" }}>
          DEPTH
        </div>
        <div style={{ fontSize: "24px", color: primaryColor, letterSpacing: "1.5px" }}>
          {depthValue}
          <span style={{ fontSize: "17px", opacity: 0.5, marginLeft: "6px" }}>m</span>
        </div>
      </div>

      {/* BOTTOM CENTER - waveform at apex */}
      <div
        style={{
          position: "absolute",
          bottom: 48,
          left: "50%",
          transform: `translateX(-50%) translateY(${-breathe * 0.3}px)`,
          pointerEvents: "none",
        }}
      >
        <svg width="160" height="32" style={{ overflow: "visible" }}>
          {[
            { baseAmp: 4, freq: 3, phaseOffset: 0, opacity: 0.8, width: 1.5 },
            { baseAmp: 3, freq: 4, phaseOffset: 2, opacity: 0.4, width: 1 },
          ].map((wave, i) => {
            const phase = time * 8 + wave.phaseOffset + (audioFrame.pulsePhase ?? 0) * 2;
            const amplitude = wave.baseAmp + pulse * 10;
            return (
              <path
                key={i}
                d={generateWavePath(160, 16, amplitude, wave.freq, phase)}
                fill="none"
                stroke={`rgba(0, 220, 180, ${wave.opacity})`}
                strokeWidth={wave.width}
              />
            );
          })}
        </svg>
      </div>

      {/* BOTTOM RIGHT - horizontal */}
      <div
        style={{
          position: "absolute",
          bottom: 52,
          right: "8%",
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: "right",
          transform: `translateY(${-breathe * 0.5}px)`,
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: "17px", color: dimColor, letterSpacing: "4px", marginBottom: "9px" }}>
          COORDINATES
        </div>
        <div style={{ fontSize: "24px", color: primaryColor, letterSpacing: "1.5px" }}>
          {(Math.sin(time * 0.2) * 100).toFixed(0)}
          <span style={{ opacity: 0.4, margin: "0 9px" }}>/</span>
          {(Math.cos(time * 0.15) * 100).toFixed(0)}
        </div>
      </div>

    </>
  );
};
