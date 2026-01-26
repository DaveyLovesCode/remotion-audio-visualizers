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
    // Envelope: fixed at edges, full amplitude in middle
    const envelope = Math.sin(t * Math.PI);
    // Traveling wave: phase increases with position for left-to-right motion
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

// Cyberpunk text strings that cycle
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

const STATUS_MESSAGES = [
  "PROCESSING...",
  "SCANNING AREA",
  "ANALYZING DATA",
  "SYNC COMPLETE",
  "CALIBRATING",
  "MONITORING",
];

/**
 * CYBERPUNK UI - Big corner elements, typing text, holographic vibes
 */
export const HolographicUI: React.FC<HolographicUIProps> = ({
  audioFrame,
  frame,
  fps,
}) => {
  const time = frame / fps;
  const pulse = audioFrame.pulse ?? 0;
  const bass = audioFrame.bass;

  // Music-driven flex - panels move together as a unit, reacting to bass
  const flexX = Math.sin(time * 0.3) * 2 + pulse * 4;
  const flexY = Math.cos(time * 0.25) * 1.5 + pulse * 3;

  // Slight tilt for depth - also music reactive
  const tiltX = Math.sin(time * 0.2) * 1 + pulse * 2;
  const tiltY = Math.cos(time * 0.15) * 0.8 + pulse * 1.5;

  // Typing effect - characters revealed over time
  const typeSpeed = 8; // chars per second
  const messageIndex = Math.floor(time / 4) % SYSTEM_MESSAGES.length;
  const statusIndex = Math.floor((time + 2) / 3) % STATUS_MESSAGES.length;

  const currentMessage = SYSTEM_MESSAGES[messageIndex];
  const currentStatus = STATUS_MESSAGES[statusIndex];

  // How much of the message to show (cycles within each message period)
  const messageTime = (time % 4);
  const charsToShow = Math.min(currentMessage.length, Math.floor(messageTime * typeSpeed));
  const displayMessage = currentMessage.substring(0, charsToShow);

  const statusTime = ((time + 2) % 3);
  const statusChars = Math.min(currentStatus.length, Math.floor(statusTime * typeSpeed));
  const displayStatus = currentStatus.substring(0, statusChars);

  // Glitch effect on beats
  const glitchActive = pulse > 0.5;
  const glitchOffsetX = glitchActive ? (Math.random() - 0.5) * 8 : 0;
  const glitchOffsetY = glitchActive ? (Math.random() - 0.5) * 4 : 0;

  // Data values
  const freqValue = Math.floor(bass * 999);
  // Mariana Trench depth ~10,994m - oscillate around it
  const depthValue = (10994 + Math.sin(time * 0.3) * 50).toFixed(0);

  // Shared glow color
  const glowColor = `rgba(0, 255, 200, ${0.6 + pulse * 0.4})`;
  const glowShadow = `0 0 20px rgba(0, 255, 200, ${0.3 + pulse * 0.4}), 0 0 40px rgba(0, 255, 200, ${0.1 + pulse * 0.2})`;

  return (
    <>
      {/* TOP LEFT - Main system readout */}
      <div
        style={{
          position: "absolute",
          top: "2%",
          left: "2%",
          width: "340px",
          transform: `
            translate(${flexX + glitchOffsetX}px, ${flexY + glitchOffsetY}px)
            perspective(800px)
            rotateX(${tiltX}deg)
            rotateY(${tiltY}deg)
          `,
          pointerEvents: "none",
        }}
      >
        {/* Corner bracket - top left */}
        <svg width="340" height="200" style={{ position: "absolute", top: 0, left: 0 }}>
          {/* L-shaped corner bracket */}
          <path
            d="M 0 80 L 0 0 L 140 0"
            fill="none"
            stroke={glowColor}
            strokeWidth="3"
            style={{ filter: `drop-shadow(${glowShadow})` }}
          />
          {/* Decorative lines */}
          <line x1="0" y1="90" x2="0" y2="150" stroke={glowColor} strokeWidth="1.5" opacity="0.5" />
          <line x1="150" y1="0" x2="240" y2="0" stroke={glowColor} strokeWidth="1.5" opacity="0.3" />
          {/* Corner accent */}
          <rect x="0" y="0" width="12" height="12" fill={glowColor} opacity={0.5 + pulse * 0.5} />
        </svg>

        {/* Content */}
        <div style={{ padding: "20px 25px", fontFamily: "monospace" }}>
          {/* Title */}
          <div style={{
            fontSize: "13px",
            color: "rgba(0, 255, 200, 0.5)",
            letterSpacing: "4px",
            marginBottom: "10px",
          }}>
            SYSTEM
          </div>

          {/* Typing message - always single line */}
          <div style={{
            fontSize: "22px",
            color: glowColor,
            textShadow: glowShadow,
            letterSpacing: "2px",
            minHeight: "28px",
            whiteSpace: "nowrap",
          }}>
            {displayMessage}
            <span style={{ opacity: Math.sin(time * 8) > 0 ? 1 : 0 }}>_</span>
          </div>

          {/* Frequency bar */}
          <div style={{ marginTop: "24px" }}>
            <div style={{
              fontSize: "12px",
              color: "rgba(0, 255, 200, 0.4)",
              letterSpacing: "2px",
              marginBottom: "8px",
            }}>
              FREQUENCY
            </div>
            <div style={{
              fontSize: "36px",
              fontWeight: "bold",
              color: glowColor,
              textShadow: glowShadow,
            }}>
              {freqValue.toString().padStart(3, "0")}
              <span style={{ fontSize: "18px", opacity: 0.6, marginLeft: "6px" }}>Hz</span>
            </div>
            {/* Bar */}
            <div style={{
              marginTop: "10px",
              height: "8px",
              background: "rgba(0, 255, 200, 0.1)",
              borderRadius: "4px",
              overflow: "hidden",
            }}>
              <div style={{
                width: `${bass * 100}%`,
                height: "100%",
                background: `linear-gradient(90deg, rgba(0, 255, 200, 0.8), rgba(0, 200, 255, 0.9))`,
                boxShadow: `0 0 15px rgba(0, 255, 200, ${0.5 + pulse})`,
                transition: "width 0.05s",
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* TOP RIGHT - Status & depth */}
      <div
        style={{
          position: "absolute",
          top: "2%",
          right: "2%",
          width: "280px",
          textAlign: "right",
          transform: `
            translate(${-flexX + glitchOffsetX}px, ${flexY + glitchOffsetY}px)
            perspective(800px)
            rotateX(${tiltX}deg)
            rotateY(${-tiltY}deg)
          `,
          pointerEvents: "none",
        }}
      >
        {/* Corner bracket - top right */}
        <svg width="280" height="180" style={{ position: "absolute", top: 0, right: 0 }}>
          <path
            d="M 280 80 L 280 0 L 140 0"
            fill="none"
            stroke={glowColor}
            strokeWidth="3"
            style={{ filter: `drop-shadow(${glowShadow})` }}
          />
          <line x1="280" y1="90" x2="280" y2="140" stroke={glowColor} strokeWidth="1.5" opacity="0.5" />
          <rect x="268" y="0" width="12" height="12" fill={glowColor} opacity={0.5 + pulse * 0.5} />
        </svg>

        <div style={{ padding: "20px 25px", fontFamily: "monospace" }}>
          <div style={{
            fontSize: "13px",
            color: "rgba(0, 255, 200, 0.5)",
            letterSpacing: "4px",
            marginBottom: "10px",
          }}>
            STATUS
          </div>

          <div style={{
            fontSize: "18px",
            color: glowColor,
            textShadow: glowShadow,
            letterSpacing: "1px",
            minHeight: "24px",
            whiteSpace: "nowrap",
          }}>
            {displayStatus}
            <span style={{ opacity: Math.sin(time * 10) > 0 ? 1 : 0 }}>_</span>
          </div>

          <div style={{ marginTop: "20px" }}>
            <div style={{
              fontSize: "12px",
              color: "rgba(0, 255, 200, 0.4)",
              letterSpacing: "2px",
              marginBottom: "6px",
            }}>
              DEPTH
            </div>
            <div style={{
              fontSize: "32px",
              fontWeight: "bold",
              color: glowColor,
              textShadow: glowShadow,
            }}>
              {depthValue}
              <span style={{ fontSize: "16px", opacity: 0.6, marginLeft: "6px" }}>m</span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM LEFT - Spectrum analyzer */}
      <div
        style={{
          position: "absolute",
          bottom: "2%",
          left: "2%",
          width: "340px",
          transform: `
            translate(${flexX + glitchOffsetX}px, ${-flexY + glitchOffsetY}px)
            perspective(800px)
            rotateX(${-tiltX}deg)
            rotateY(${tiltY}deg)
          `,
          pointerEvents: "none",
        }}
      >
        <svg width="340" height="140" style={{ position: "absolute", bottom: 0, left: 0 }}>
          {/* L bracket bottom left */}
          <path
            d="M 0 60 L 0 140 L 140 140"
            fill="none"
            stroke={glowColor}
            strokeWidth="3"
            style={{ filter: `drop-shadow(${glowShadow})` }}
          />
          <line x1="150" y1="140" x2="240" y2="140" stroke={glowColor} strokeWidth="1.5" opacity="0.3" />
          <rect x="0" y="128" width="12" height="12" fill={glowColor} opacity={0.5 + pulse * 0.5} />
        </svg>

        <div style={{ padding: "15px 25px 8px" }}>
          <svg width="215" height="50" style={{ overflow: "visible" }}>
            {/* Three layered sine waves driven by audio */}
            {[
              { baseY: 25, baseAmp: 5, freq: 3, phaseOffset: 0, opacity: 0.9, width: 2.5 },
              { baseY: 25, baseAmp: 4, freq: 4, phaseOffset: 2, opacity: 0.5, width: 1.5 },
              { baseY: 25, baseAmp: 3, freq: 5, phaseOffset: 4, opacity: 0.3, width: 1 },
            ].map((wave, i) => {
              const phase = time * 8 + wave.phaseOffset + (audioFrame.pulsePhase ?? 0) * 2;
              const amplitude = wave.baseAmp + pulse * 14;

              return (
                <path
                  key={i}
                  d={generateWavePath(215, wave.baseY, amplitude, wave.freq, phase)}
                  fill="none"
                  stroke={`rgba(0, 255, 200, ${wave.opacity})`}
                  strokeWidth={wave.width}
                  style={{
                    filter: pulse > 0.2 ? `drop-shadow(0 0 ${4 + pulse * 6}px rgba(0, 255, 200, ${0.4 + pulse * 0.3}))` : "none",
                  }}
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* BOTTOM RIGHT - Coordinates / tracking */}
      <div
        style={{
          position: "absolute",
          bottom: "2%",
          right: "2%",
          width: "280px",
          textAlign: "right",
          transform: `
            translate(${-flexX + glitchOffsetX}px, ${-flexY + glitchOffsetY}px)
            perspective(800px)
            rotateX(${-tiltX}deg)
            rotateY(${-tiltY}deg)
          `,
          pointerEvents: "none",
        }}
      >
        <svg width="280" height="160" style={{ position: "absolute", bottom: 0, right: 0 }}>
          <path
            d="M 280 80 L 280 160 L 140 160"
            fill="none"
            stroke={glowColor}
            strokeWidth="3"
            style={{ filter: `drop-shadow(${glowShadow})` }}
          />
          <line x1="280" y1="70" x2="280" y2="30" stroke={glowColor} strokeWidth="1.5" opacity="0.5" />
          <rect x="268" y="148" width="12" height="12" fill={glowColor} opacity={0.5 + pulse * 0.5} />
        </svg>

        <div style={{ padding: "20px 25px 30px", fontFamily: "monospace" }}>
          <div style={{
            fontSize: "13px",
            color: "rgba(0, 255, 200, 0.5)",
            letterSpacing: "4px",
            marginBottom: "12px",
          }}>
            COORDINATES
          </div>

          <div style={{
            fontSize: "18px",
            color: glowColor,
            textShadow: glowShadow,
            lineHeight: "1.8",
          }}>
            <div>X: {(Math.sin(time * 0.2) * 100).toFixed(2)}</div>
            <div>Y: {(Math.cos(time * 0.15) * 100).toFixed(2)}</div>
            <div>Z: {(-time * 2 % 1000).toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Scanning line */}
      <div
        style={{
          position: "absolute",
          left: "5%",
          right: "5%",
          top: `${10 + ((time * 30) % 80)}%`,
          height: "1px",
          background: `linear-gradient(90deg,
            transparent 0%,
            rgba(0, 255, 200, ${0.15 + pulse * 0.2}) 20%,
            rgba(0, 255, 200, ${0.25 + pulse * 0.3}) 50%,
            rgba(0, 255, 200, ${0.15 + pulse * 0.2}) 80%,
            transparent 100%
          )`,
          pointerEvents: "none",
          boxShadow: `0 0 10px rgba(0, 255, 200, ${0.2 + pulse * 0.2})`,
        }}
      />

      {/* Glitch lines on beats */}
      {glitchActive && (
        <>
          <div style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${20 + Math.random() * 60}%`,
            height: "2px",
            background: `rgba(0, 255, 200, ${pulse * 0.6})`,
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${20 + Math.random() * 60}%`,
            height: "1px",
            background: `rgba(255, 0, 100, ${pulse * 0.4})`,
            pointerEvents: "none",
          }} />
        </>
      )}
    </>
  );
};
