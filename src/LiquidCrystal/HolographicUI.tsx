import { useRef, useMemo } from "react";
import type { AudioFrame } from "../audio/types";

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
  const decay = audioFrame.decay ?? 0;
  const bass = audioFrame.bass;

  // Parallax wobble
  const wobbleX = Math.sin(time * 0.5) * 6 + Math.sin(time * 1.1) * 3;
  const wobbleY = Math.cos(time * 0.4) * 5 + Math.cos(time * 0.9) * 2;

  // Zoom scale
  const zoomScale = 1 + decay * 0.05;

  // Holographic tilt
  const tiltX = Math.sin(time * 0.3) * 2 + decay * 3;
  const tiltY = Math.cos(time * 0.25) * 1.5;

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
  const glitchActive = decay > 0.5;
  const glitchOffsetX = glitchActive ? (Math.random() - 0.5) * 8 : 0;
  const glitchOffsetY = glitchActive ? (Math.random() - 0.5) * 4 : 0;

  // Data values
  const freqValue = Math.floor(bass * 999);
  const depthValue = (20 + Math.sin(time * 0.3) * 5).toFixed(1);

  // Shared glow color
  const glowColor = `rgba(0, 255, 200, ${0.6 + decay * 0.4})`;
  const glowShadow = `0 0 20px rgba(0, 255, 200, ${0.3 + decay * 0.4}), 0 0 40px rgba(0, 255, 200, ${0.1 + decay * 0.2})`;

  return (
    <>
      {/* TOP LEFT - Main system readout */}
      <div
        style={{
          position: "absolute",
          top: "3%",
          left: "3%",
          width: "280px",
          transform: `
            translate(${wobbleX * 0.8 + glitchOffsetX}px, ${wobbleY * 0.8 + glitchOffsetY}px)
            scale(${zoomScale})
            perspective(800px)
            rotateX(${tiltX}deg)
            rotateY(${tiltY}deg)
          `,
          pointerEvents: "none",
        }}
      >
        {/* Corner bracket - top left */}
        <svg width="280" height="180" style={{ position: "absolute", top: 0, left: 0 }}>
          {/* L-shaped corner bracket */}
          <path
            d="M 0 60 L 0 0 L 100 0"
            fill="none"
            stroke={glowColor}
            strokeWidth="2"
            style={{ filter: `drop-shadow(${glowShadow})` }}
          />
          {/* Decorative lines */}
          <line x1="0" y1="70" x2="0" y2="120" stroke={glowColor} strokeWidth="1" opacity="0.5" />
          <line x1="110" y1="0" x2="180" y2="0" stroke={glowColor} strokeWidth="1" opacity="0.3" />
          {/* Corner accent */}
          <rect x="0" y="0" width="8" height="8" fill={glowColor} opacity={0.5 + decay * 0.5} />
        </svg>

        {/* Content */}
        <div style={{ padding: "15px 20px", fontFamily: "monospace" }}>
          {/* Title */}
          <div style={{
            fontSize: "11px",
            color: "rgba(0, 255, 200, 0.5)",
            letterSpacing: "3px",
            marginBottom: "8px",
          }}>
            SYSTEM
          </div>

          {/* Typing message */}
          <div style={{
            fontSize: "18px",
            color: glowColor,
            textShadow: glowShadow,
            letterSpacing: "2px",
            minHeight: "24px",
          }}>
            {displayMessage}
            <span style={{ opacity: Math.sin(time * 8) > 0 ? 1 : 0 }}>_</span>
          </div>

          {/* Frequency bar */}
          <div style={{ marginTop: "20px" }}>
            <div style={{
              fontSize: "10px",
              color: "rgba(0, 255, 200, 0.4)",
              letterSpacing: "2px",
              marginBottom: "6px",
            }}>
              FREQUENCY
            </div>
            <div style={{
              fontSize: "28px",
              fontWeight: "bold",
              color: glowColor,
              textShadow: glowShadow,
            }}>
              {freqValue.toString().padStart(3, "0")}
              <span style={{ fontSize: "14px", opacity: 0.6, marginLeft: "4px" }}>Hz</span>
            </div>
            {/* Bar */}
            <div style={{
              marginTop: "8px",
              height: "6px",
              background: "rgba(0, 255, 200, 0.1)",
              borderRadius: "3px",
              overflow: "hidden",
            }}>
              <div style={{
                width: `${bass * 100}%`,
                height: "100%",
                background: `linear-gradient(90deg, rgba(0, 255, 200, 0.8), rgba(0, 200, 255, 0.9))`,
                boxShadow: `0 0 15px rgba(0, 255, 200, ${0.5 + decay})`,
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
          top: "3%",
          right: "3%",
          width: "220px",
          textAlign: "right",
          transform: `
            translate(${-wobbleX * 0.6 + glitchOffsetX}px, ${wobbleY * 0.7 + glitchOffsetY}px)
            scale(${zoomScale})
            perspective(800px)
            rotateX(${tiltX}deg)
            rotateY(${-tiltY}deg)
          `,
          pointerEvents: "none",
        }}
      >
        {/* Corner bracket - top right */}
        <svg width="220" height="140" style={{ position: "absolute", top: 0, right: 0 }}>
          <path
            d="M 220 60 L 220 0 L 140 0"
            fill="none"
            stroke={glowColor}
            strokeWidth="2"
            style={{ filter: `drop-shadow(${glowShadow})` }}
          />
          <line x1="220" y1="70" x2="220" y2="100" stroke={glowColor} strokeWidth="1" opacity="0.5" />
          <rect x="212" y="0" width="8" height="8" fill={glowColor} opacity={0.5 + decay * 0.5} />
        </svg>

        <div style={{ padding: "15px 20px", fontFamily: "monospace" }}>
          <div style={{
            fontSize: "11px",
            color: "rgba(0, 255, 200, 0.5)",
            letterSpacing: "3px",
            marginBottom: "8px",
          }}>
            STATUS
          </div>

          <div style={{
            fontSize: "14px",
            color: glowColor,
            textShadow: glowShadow,
            letterSpacing: "1px",
            minHeight: "20px",
          }}>
            {displayStatus}
            <span style={{ opacity: Math.sin(time * 10) > 0 ? 1 : 0 }}>_</span>
          </div>

          <div style={{ marginTop: "15px" }}>
            <div style={{
              fontSize: "10px",
              color: "rgba(0, 255, 200, 0.4)",
              letterSpacing: "2px",
              marginBottom: "4px",
            }}>
              DEPTH
            </div>
            <div style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: glowColor,
              textShadow: glowShadow,
            }}>
              {depthValue}
              <span style={{ fontSize: "12px", opacity: 0.6, marginLeft: "4px" }}>m</span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM LEFT - Waveform visualization */}
      <div
        style={{
          position: "absolute",
          bottom: "3%",
          left: "3%",
          width: "260px",
          transform: `
            translate(${wobbleX * 0.7}px, ${-wobbleY * 0.8}px)
            scale(${zoomScale})
            perspective(800px)
            rotateX(${-tiltX}deg)
            rotateY(${tiltY}deg)
          `,
          pointerEvents: "none",
        }}
      >
        <svg width="260" height="100" style={{ position: "absolute", bottom: 0, left: 0 }}>
          {/* L bracket bottom left */}
          <path
            d="M 0 40 L 0 100 L 80 100"
            fill="none"
            stroke={glowColor}
            strokeWidth="2"
            style={{ filter: `drop-shadow(${glowShadow})` }}
          />
          <line x1="90" y1="100" x2="150" y2="100" stroke={glowColor} strokeWidth="1" opacity="0.3" />
          <rect x="0" y="92" width="8" height="8" fill={glowColor} opacity={0.5 + decay * 0.5} />
        </svg>

        <div style={{ padding: "10px 20px 20px", fontFamily: "monospace" }}>
          <div style={{
            fontSize: "10px",
            color: "rgba(0, 255, 200, 0.4)",
            letterSpacing: "2px",
            marginBottom: "10px",
          }}>
            SIGNAL
          </div>

          {/* Waveform bars */}
          <svg width="220" height="50" style={{ overflow: "visible" }}>
            {Array.from({ length: 32 }, (_, i) => {
              const phase = time * 6 + i * 0.3;
              const height = (Math.sin(phase) * 0.5 + 0.5) * (0.3 + decay * 0.7) * 40 + 4;
              return (
                <rect
                  key={i}
                  x={i * 7}
                  y={25 - height / 2}
                  width="5"
                  height={height}
                  fill={`rgba(0, 255, 200, ${0.3 + (i / 32) * 0.4 + decay * 0.3})`}
                  style={{
                    filter: decay > 0.3 ? `drop-shadow(0 0 4px rgba(0, 255, 200, 0.6))` : "none",
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
          bottom: "3%",
          right: "3%",
          width: "200px",
          textAlign: "right",
          transform: `
            translate(${-wobbleX * 0.6}px, ${-wobbleY * 0.7}px)
            scale(${zoomScale})
            perspective(800px)
            rotateX(${-tiltX}deg)
            rotateY(${-tiltY}deg)
          `,
          pointerEvents: "none",
        }}
      >
        <svg width="200" height="100" style={{ position: "absolute", bottom: 0, right: 0 }}>
          <path
            d="M 200 40 L 200 100 L 120 100"
            fill="none"
            stroke={glowColor}
            strokeWidth="2"
            style={{ filter: `drop-shadow(${glowShadow})` }}
          />
          <rect x="192" y="92" width="8" height="8" fill={glowColor} opacity={0.5 + decay * 0.5} />
        </svg>

        <div style={{ padding: "10px 20px 20px", fontFamily: "monospace" }}>
          <div style={{
            fontSize: "10px",
            color: "rgba(0, 255, 200, 0.4)",
            letterSpacing: "2px",
            marginBottom: "8px",
          }}>
            COORDINATES
          </div>

          <div style={{
            fontSize: "12px",
            color: glowColor,
            textShadow: glowShadow,
            lineHeight: "1.6",
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
            rgba(0, 255, 200, ${0.15 + decay * 0.2}) 20%,
            rgba(0, 255, 200, ${0.25 + decay * 0.3}) 50%,
            rgba(0, 255, 200, ${0.15 + decay * 0.2}) 80%,
            transparent 100%
          )`,
          pointerEvents: "none",
          boxShadow: `0 0 10px rgba(0, 255, 200, ${0.2 + decay * 0.2})`,
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
            background: `rgba(0, 255, 200, ${decay * 0.6})`,
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${20 + Math.random() * 60}%`,
            height: "1px",
            background: `rgba(255, 0, 100, ${decay * 0.4})`,
            pointerEvents: "none",
          }} />
        </>
      )}
    </>
  );
};
