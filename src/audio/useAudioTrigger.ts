import { useRef } from "react";

interface TriggerConfig {
  /** Value to compare against threshold */
  value: number;
  /** Threshold to trigger on (rising edge) */
  threshold: number;
  /** Current time in seconds */
  time: number;
  /** Duration of decay in seconds */
  decayDuration: number;
}

interface TriggerResult {
  /** 0-1 intensity, decaying from 1 at trigger to 0 */
  intensity: number;
  /** Whether we just triggered this frame */
  justTriggered: boolean;
  /** Whether we've ever triggered */
  hasTriggered: boolean;
  /** Time of last trigger (-Infinity if never) */
  triggerTime: number;
}

/**
 * Rising-edge trigger with decay
 *
 * Fires when value crosses above threshold, then decays intensity
 * from 1 to 0 over decayDuration seconds.
 *
 * Remotion-compatible: handles out-of-order frame rendering by resetting
 * state when time jumps backwards (seeking, looping, prefetch reordering).
 */
export function useAudioTrigger({
  value,
  threshold,
  time,
  decayDuration,
}: TriggerConfig): TriggerResult {
  const wasAboveRef = useRef(false);
  const triggerTimeRef = useRef(-Infinity);
  const lastTimeRef = useRef(-Infinity);

  // Remotion renders frames out of order. If time jumped backwards,
  // we need to reset trigger state to avoid stale data from future frames.
  if (time < lastTimeRef.current - 0.05) {
    // Time went backwards - reset all state
    wasAboveRef.current = false;
    triggerTimeRef.current = -Infinity;
  }
  lastTimeRef.current = time;

  const isAbove = value > threshold;
  let justTriggered = false;

  // Rising-edge detection
  if (isAbove && !wasAboveRef.current) {
    triggerTimeRef.current = time;
    justTriggered = true;
    wasAboveRef.current = true;
  } else if (!isAbove) {
    wasAboveRef.current = false;
  }

  // Calculate intensity
  // If trigger is in the future (negative elapsed), intensity = 0
  // This handles the case where we haven't reached a trigger point yet
  const elapsed = time - triggerTimeRef.current;
  const intensity = elapsed >= 0 ? Math.max(0, 1 - elapsed / decayDuration) : 0;

  return {
    intensity,
    justTriggered,
    hasTriggered: triggerTimeRef.current > -Infinity,
    triggerTime: triggerTimeRef.current,
  };
}

interface MultiWaveConfig {
  /** Value to compare against threshold */
  value: number;
  /** Threshold to trigger on (rising edge) */
  threshold: number;
  /** Current time in seconds */
  time: number;
  /** How long waves live before removal */
  maxWaveAge: number;
  /** Max concurrent waves */
  maxWaves?: number;
}

interface Wave {
  startTime: number;
  originX: number;
  originY: number;
}

interface MultiWaveResult {
  /** Active waves with their start times and origins */
  waves: Wave[];
  /** Whether we just triggered a new wave this frame */
  justTriggered: boolean;
  /** Packed wave times (time since each wave started) - only positive values */
  waveTimes: number[];
}

/**
 * Multi-wave trigger system for GPU particle effects
 *
 * Creates new waves on rising edge, maintains up to maxWaves concurrent waves,
 * auto-removes waves older than maxWaveAge.
 *
 * Remotion-compatible: handles out-of-order frame rendering.
 */
export function useMultiWaveTrigger({
  value,
  threshold,
  time,
  maxWaveAge,
  maxWaves = 6,
}: MultiWaveConfig): MultiWaveResult {
  const wavesRef = useRef<Wave[]>([]);
  const wasAboveRef = useRef(false);
  const lastTimeRef = useRef(-Infinity);

  // Remotion renders frames out of order. If time jumped backwards,
  // reset state to avoid stale data from future frames.
  if (time < lastTimeRef.current - 0.05) {
    wavesRef.current = [];
    wasAboveRef.current = false;
  }
  lastTimeRef.current = time;

  const isAbove = value > threshold;
  let justTriggered = false;

  // Rising-edge detection - spawn new wave
  if (isAbove && !wasAboveRef.current) {
    // Random direction for wave origin
    const seed = Math.sin(time * 12.9898 + 78.233) * 43758.5453;
    const angle = (seed - Math.floor(seed)) * Math.PI * 2;

    wavesRef.current.push({
      startTime: time,
      originX: Math.cos(angle),
      originY: Math.sin(angle),
    });

    if (wavesRef.current.length > maxWaves) {
      wavesRef.current.shift();
    }

    justTriggered = true;
    wasAboveRef.current = true;
  } else if (!isAbove) {
    wasAboveRef.current = false;
  }

  // Remove expired waves AND waves from the future (stale from out-of-order rendering)
  wavesRef.current = wavesRef.current.filter(
    (w) => w.startTime <= time && time - w.startTime < maxWaveAge
  );

  // Compute wave times for shader uniforms - only include valid (positive) times
  const waveTimes = wavesRef.current.map((w) => time - w.startTime);

  return {
    waves: wavesRef.current,
    justTriggered,
    waveTimes,
  };
}
