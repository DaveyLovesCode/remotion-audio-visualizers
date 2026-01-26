import { useRef } from "react";
import type { AudioFrame } from "../audio/types";

interface HolographicUIProps {
  audioFrame: AudioFrame;
  frame: number;
  fps: number;
}

/**
 * HOLOGRAPHIC UI OVERLAYS
 * Floating frames that wobble like holographic cards
 * Parallax motion, glitch effects, data readouts
 */
export const HolographicUI: React.FC<HolographicUIProps> = ({
  audioFrame,
  frame,
  fps,
}) => {
  const time = frame / fps;
  const decay = audioFrame.decay ?? 0;
  const bass = audioFrame.bass;
  const energy = audioFrame.energy;

  // Parallax wobble - elements shift with pseudo-3D effect
  const wobbleX = Math.sin(time * 0.7) * 8 + Math.sin(time * 1.3) * 4;
  const wobbleY = Math.cos(time * 0.5) * 6 + Math.cos(time * 1.1) * 3;

  // Beat-reactive zoom
  const zoomScale = 1 + decay * 0.08;

  // Holographic tilt (perspective transform)
  const tiltX = Math.sin(time * 0.4) * 3 + decay * 5;
  const tiltY = Math.cos(time * 0.3) * 2;

  // Glitch offset on beats
  const glitchX = decay > 0.5 ? (Math.random() - 0.5) * 10 * decay : 0;
  const glitchY = decay > 0.5 ? (Math.random() - 0.5) * 5 * decay : 0;

  // Scanline position
  const scanlineY = ((time * 100) % 120) - 10;

  // Data values that react to audio
  const freqValue = Math.floor(bass * 999);
  const energyValue = Math.floor(energy * 100);
  const phaseValue = ((audioFrame.decayPhase ?? 0) * 57.3) % 360;

  // Corner frame style
  const cornerFrameStyle = (corner: 'tl' | 'tr' | 'bl' | 'br'): React.CSSProperties => {
    const isTop = corner.includes('t');
    const isLeft = corner.includes('l');

    // Each corner has slightly different parallax
    const parallaxMultiplier = { tl: 1, tr: 0.8, bl: 0.9, br: 1.1 }[corner];
    const offsetX = wobbleX * parallaxMultiplier + glitchX;
    const offsetY = wobbleY * parallaxMultiplier + glitchY;

    return {
      position: 'absolute',
      [isTop ? 'top' : 'bottom']: `${3 + Math.abs(offsetY * 0.2)}%`,
      [isLeft ? 'left' : 'right']: `${3 + Math.abs(offsetX * 0.2)}%`,
      width: '120px',
      height: '80px',
      border: `1px solid rgba(0, 255, 200, ${0.3 + decay * 0.5})`,
      borderRadius: '4px',
      background: `linear-gradient(
        ${isTop ? '180deg' : '0deg'},
        rgba(0, 255, 200, ${0.05 + decay * 0.1}),
        transparent
      )`,
      transform: `
        translate(${offsetX}px, ${offsetY}px)
        scale(${zoomScale})
        perspective(500px)
        rotateX(${tiltX * (isTop ? 1 : -1)}deg)
        rotateY(${tiltY * (isLeft ? 1 : -1)}deg)
      `,
      boxShadow: `
        0 0 20px rgba(0, 255, 200, ${0.1 + decay * 0.3}),
        inset 0 0 30px rgba(0, 255, 200, ${0.05 + decay * 0.1})
      `,
      pointerEvents: 'none',
      overflow: 'hidden',
    };
  };

  // Data readout style
  const dataStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: `rgba(0, 255, 200, ${0.6 + decay * 0.4})`,
    textShadow: `0 0 10px rgba(0, 255, 200, ${0.5 + decay * 0.5})`,
    padding: '8px',
    letterSpacing: '1px',
  };

  return (
    <>
      {/* TOP LEFT FRAME - Frequency data */}
      <div style={cornerFrameStyle('tl')}>
        <div style={dataStyle}>
          <div style={{ marginBottom: '4px', opacity: 0.6 }}>FREQ.BASS</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
            {freqValue.toString().padStart(3, '0')} Hz
          </div>
          <div style={{ marginTop: '8px', height: '4px', background: 'rgba(0,255,200,0.2)', borderRadius: '2px' }}>
            <div style={{
              width: `${bass * 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, #00ffc8, #00ffff)`,
              borderRadius: '2px',
              boxShadow: `0 0 10px rgba(0, 255, 200, ${0.5 + decay})`,
              transition: 'width 0.05s',
            }} />
          </div>
        </div>
        {/* Scanline */}
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${scanlineY}%`,
          height: '2px',
          background: `linear-gradient(90deg, transparent, rgba(0, 255, 200, ${0.3 + decay * 0.5}), transparent)`,
        }} />
      </div>

      {/* TOP RIGHT FRAME - Energy meter */}
      <div style={cornerFrameStyle('tr')}>
        <div style={dataStyle}>
          <div style={{ marginBottom: '4px', opacity: 0.6 }}>ENERGY</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
            {energyValue}%
          </div>
          {/* Circular indicator */}
          <svg width="40" height="40" style={{ marginTop: '4px' }}>
            <circle
              cx="20" cy="20" r="15"
              fill="none"
              stroke="rgba(0,255,200,0.2)"
              strokeWidth="3"
            />
            <circle
              cx="20" cy="20" r="15"
              fill="none"
              stroke={`rgba(0, 255, 200, ${0.6 + decay * 0.4})`}
              strokeWidth="3"
              strokeDasharray={`${energy * 94} 94`}
              strokeLinecap="round"
              transform="rotate(-90 20 20)"
              style={{
                filter: `drop-shadow(0 0 5px rgba(0, 255, 200, ${decay}))`,
              }}
            />
          </svg>
        </div>
      </div>

      {/* BOTTOM LEFT FRAME - Phase */}
      <div style={cornerFrameStyle('bl')}>
        <div style={dataStyle}>
          <div style={{ marginBottom: '4px', opacity: 0.6 }}>PHASE</div>
          <div style={{ fontSize: '14px' }}>
            {phaseValue.toFixed(1)}°
          </div>
          {/* Rotating indicator */}
          <div style={{
            width: '30px',
            height: '30px',
            marginTop: '4px',
            border: '1px solid rgba(0,255,200,0.3)',
            borderRadius: '50%',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '12px',
              height: '2px',
              background: `rgba(0, 255, 200, ${0.7 + decay * 0.3})`,
              transformOrigin: 'left center',
              transform: `rotate(${phaseValue}deg)`,
              boxShadow: `0 0 8px rgba(0, 255, 200, ${0.5 + decay})`,
            }} />
          </div>
        </div>
      </div>

      {/* BOTTOM RIGHT FRAME - Waveform */}
      <div style={cornerFrameStyle('br')}>
        <div style={dataStyle}>
          <div style={{ marginBottom: '4px', opacity: 0.6 }}>SIGNAL</div>
          {/* Fake waveform */}
          <svg width="100" height="35" style={{ overflow: 'visible' }}>
            {Array.from({ length: 20 }, (_, i) => {
              const x = i * 5;
              const height = (Math.sin(time * 8 + i * 0.5) * 0.5 + 0.5) * (0.3 + decay * 0.7) * 30;
              return (
                <rect
                  key={i}
                  x={x}
                  y={17.5 - height / 2}
                  width="3"
                  height={Math.max(2, height)}
                  fill={`rgba(0, 255, 200, ${0.4 + (i / 20) * 0.4 + decay * 0.2})`}
                  style={{
                    filter: decay > 0.3 ? `drop-shadow(0 0 3px rgba(0, 255, 200, 0.8))` : 'none',
                  }}
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* CENTER RETICLE - appears on high energy */}
      {decay > 0.3 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${1 + decay * 0.3})`,
          pointerEvents: 'none',
        }}>
          <svg width="100" height="100" style={{ overflow: 'visible' }}>
            {/* Outer ring */}
            <circle
              cx="50" cy="50" r="40"
              fill="none"
              stroke={`rgba(0, 255, 200, ${decay * 0.3})`}
              strokeWidth="1"
              strokeDasharray="8 8"
              style={{
                transform: `rotate(${time * 30}deg)`,
                transformOrigin: '50px 50px',
              }}
            />
            {/* Inner ring */}
            <circle
              cx="50" cy="50" r="25"
              fill="none"
              stroke={`rgba(0, 255, 200, ${decay * 0.5})`}
              strokeWidth="1"
              style={{
                transform: `rotate(${-time * 45}deg)`,
                transformOrigin: '50px 50px',
              }}
            />
            {/* Crosshairs */}
            <line x1="50" y1="20" x2="50" y2="35" stroke={`rgba(0, 255, 200, ${decay * 0.6})`} strokeWidth="1" />
            <line x1="50" y1="65" x2="50" y2="80" stroke={`rgba(0, 255, 200, ${decay * 0.6})`} strokeWidth="1" />
            <line x1="20" y1="50" x2="35" y2="50" stroke={`rgba(0, 255, 200, ${decay * 0.6})`} strokeWidth="1" />
            <line x1="65" y1="50" x2="80" y2="50" stroke={`rgba(0, 255, 200, ${decay * 0.6})`} strokeWidth="1" />
          </svg>
        </div>
      )}

      {/* Horizontal scan line across whole screen */}
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${(scanlineY + 50) % 100}%`,
        height: '1px',
        background: `linear-gradient(90deg,
          transparent 0%,
          rgba(0, 255, 200, ${0.1 + decay * 0.2}) 20%,
          rgba(0, 255, 200, ${0.2 + decay * 0.3}) 50%,
          rgba(0, 255, 200, ${0.1 + decay * 0.2}) 80%,
          transparent 100%
        )`,
        pointerEvents: 'none',
      }} />
    </>
  );
};
