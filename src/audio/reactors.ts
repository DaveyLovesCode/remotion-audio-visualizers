/**
 * Audio Reactors - DRY, plug-and-play audio reactivity transformations
 *
 * All reactors take a 0-1 input (typically from audio analysis) and return
 * a transformed 0-1 output. The transformation defines the "feel" of the
 * reactivity.
 *
 * Remotion-compatible: handles out-of-order frame rendering by resetting
 * state when time jumps backwards (seeking, looping, prefetch).
 */

import { useRef } from "react";

// ============================================================================
// PULSE REACTOR
// ============================================================================
// Follows input with optional decay cushioning.
// - Non-additive: output = max(input, decayed previous) - classic "envelope follower"
// - Additive: each hit adds to accumulated value, which decays over time
//
// Use cases:
// - Scale pulsing with bass (non-additive, fast decay)
// - Building intensity over a drop (additive, slow decay)
// - Smooth camera throttle (non-additive, medium decay)

export interface PulseConfig {
  /** Decay rate per second. 0 = instant (no memory), 1 = very slow decay. Default 0.1 */
  decay?: number;
  /** If true, hits accumulate rather than max. Default false */
  additive?: boolean;
  /** Max value in additive mode. Default 1 */
  ceiling?: number;
  /** How much each hit adds in additive mode. Default 0.5 */
  addRate?: number;
}

interface PulseState {
  value: number;
  lastTime: number;
}

/**
 * Pulse reactor - envelope follower with decay
 *
 * @param input - 0-1 value from audio analysis
 * @param time - current time in seconds
 * @param config - decay, additive mode, etc.
 * @returns 0-1 transformed value
 *
 * @example
 * ```tsx
 * // Snappy scale pulse
 * const pulse = usePulseReactor(audioFrame.bass, time, { decay: 0.15 });
 * const scale = 1 + pulse * 0.2;
 *
 * // Building intensity (additive)
 * const intensity = usePulseReactor(audioFrame.bass, time, {
 *   decay: 0.3,
 *   additive: true,
 *   ceiling: 2,
 * });
 * ```
 */
export function usePulseReactor(
  input: number,
  time: number,
  config: PulseConfig = {}
): number {
  const {
    decay = 0.1,
    additive = false,
    ceiling = 1,
    addRate = 0.5,
  } = config;

  const stateRef = useRef<PulseState>({ value: 0, lastTime: -Infinity });

  // Reset if time jumped backwards (Remotion seeking/looping)
  if (time < stateRef.current.lastTime - 0.05) {
    stateRef.current = { value: 0, lastTime: time };
  }

  const dt = Math.max(0, time - stateRef.current.lastTime);
  stateRef.current.lastTime = time;

  // Convert decay (0-1) to per-frame multiplier
  // decay=0 → instant (multiplier=0), decay=1 → very slow (multiplier≈0.99)
  const decayPerSecond = 1 - Math.pow(1 - decay, 3); // curve for better feel
  const retainRatio = Math.pow(decayPerSecond, dt * 60); // normalized to ~60fps equivalent

  const prev = stateRef.current.value;

  let next: number;
  if (additive) {
    // Additive: decay previous, add input contribution
    next = Math.min(ceiling, prev * retainRatio + input * addRate * dt * 10);
  } else {
    // Non-additive: max of input and decayed previous
    next = Math.max(input, prev * retainRatio);
  }

  stateRef.current.value = next;
  return Math.min(1, next); // clamp for non-additive, additive uses ceiling
}

// ============================================================================
// TRIGGER REACTOR
// ============================================================================
// Fires on rising edge (when input crosses threshold), then decays intensity
// from 1 to 0 over the decay duration.
//
// Use cases:
// - Beat-synced flashes
// - Particle bursts on hits
// - One-shot animations

export interface TriggerConfig {
  /** Threshold to trigger on (rising edge). Default 0.5 */
  threshold?: number;
  /** Duration to decay from 1 to 0, in seconds. Default 0.3 */
  decayDuration?: number;
  /** If true, multiple triggers can stack intensity. Default false */
  additive?: boolean;
  /** Max stacked intensity in additive mode. Default 2 */
  ceiling?: number;
}

export interface TriggerResult {
  /** 0-1 intensity (or higher in additive mode), decaying from peak */
  intensity: number;
  /** Whether we triggered this frame */
  justTriggered: boolean;
  /** Time of last trigger (-Infinity if never) */
  triggerTime: number;
}

interface TriggerState {
  wasAbove: boolean;
  triggerTime: number;
  lastTime: number;
  // For additive mode
  stackedIntensity: number;
}

/**
 * Trigger reactor - rising-edge detector with decay
 *
 * @param input - 0-1 value from audio analysis
 * @param time - current time in seconds
 * @param config - threshold, decay duration, additive mode
 * @returns { intensity, justTriggered, triggerTime }
 *
 * @example
 * ```tsx
 * // Beat flash
 * const { intensity, justTriggered } = useTriggerReactor(audioFrame.bass, time, {
 *   threshold: 0.6,
 *   decayDuration: 0.2,
 * });
 * const brightness = 1 + intensity * 2;
 *
 * // Stacking hits (additive)
 * const { intensity } = useTriggerReactor(audioFrame.kick, time, {
 *   threshold: 0.5,
 *   decayDuration: 0.5,
 *   additive: true,
 *   ceiling: 3,
 * });
 * ```
 */
export function useTriggerReactor(
  input: number,
  time: number,
  config: TriggerConfig = {}
): TriggerResult {
  const {
    threshold = 0.5,
    decayDuration = 0.3,
    additive = false,
    ceiling = 2,
  } = config;

  const stateRef = useRef<TriggerState>({
    wasAbove: false,
    triggerTime: -Infinity,
    lastTime: -Infinity,
    stackedIntensity: 0,
  });

  // Reset if time jumped backwards (Remotion seeking/looping)
  if (time < stateRef.current.lastTime - 0.05) {
    stateRef.current = {
      wasAbove: false,
      triggerTime: -Infinity,
      lastTime: time,
      stackedIntensity: 0,
    };
  }

  const dt = Math.max(0, time - stateRef.current.lastTime);
  stateRef.current.lastTime = time;

  const isAbove = input > threshold;
  let justTriggered = false;

  // Rising-edge detection
  if (isAbove && !stateRef.current.wasAbove) {
    stateRef.current.triggerTime = time;
    justTriggered = true;

    if (additive) {
      // Stack: add 1 to current decayed intensity
      stateRef.current.stackedIntensity = Math.min(
        ceiling,
        stateRef.current.stackedIntensity + 1
      );
    }
  }
  stateRef.current.wasAbove = isAbove;

  // Calculate intensity
  let intensity: number;
  if (additive) {
    // Decay stacked intensity over time
    const decayRate = 1 / decayDuration;
    stateRef.current.stackedIntensity = Math.max(
      0,
      stateRef.current.stackedIntensity - decayRate * dt
    );
    intensity = stateRef.current.stackedIntensity;
  } else {
    // Single trigger: linear decay from 1 to 0
    const elapsed = time - stateRef.current.triggerTime;
    intensity = elapsed >= 0 ? Math.max(0, 1 - elapsed / decayDuration) : 0;
  }

  return {
    intensity,
    justTriggered,
    triggerTime: stateRef.current.triggerTime,
  };
}

// ============================================================================
// MULTI-TRIGGER (for particle systems, etc.)
// ============================================================================
// Same as trigger but tracks multiple concurrent triggers for GPU effects

export interface MultiTriggerConfig {
  /** Threshold to trigger on. Default 0.5 */
  threshold?: number;
  /** How long each trigger lives. Default 1.0 */
  maxAge?: number;
  /** Max concurrent triggers. Default 6 */
  maxCount?: number;
}

export interface TriggerInstance {
  startTime: number;
  /** Random seed for this trigger (for varied visuals) */
  seed: number;
}

export interface MultiTriggerResult {
  /** Active triggers */
  triggers: TriggerInstance[];
  /** Whether we just triggered */
  justTriggered: boolean;
  /** Ages of each trigger (time since start) */
  ages: number[];
}

interface MultiTriggerState {
  triggers: TriggerInstance[];
  wasAbove: boolean;
  lastTime: number;
}

/**
 * Multi-trigger reactor - spawns multiple concurrent trigger instances
 *
 * @example
 * ```tsx
 * const { triggers, ages } = useMultiTriggerReactor(audioFrame.bass, time, {
 *   threshold: 0.5,
 *   maxAge: 2.0,
 *   maxCount: 8,
 * });
 * // Pass ages to shader for particle waves
 * ```
 */
export function useMultiTriggerReactor(
  input: number,
  time: number,
  config: MultiTriggerConfig = {}
): MultiTriggerResult {
  const { threshold = 0.5, maxAge = 1.0, maxCount = 6 } = config;

  const stateRef = useRef<MultiTriggerState>({
    triggers: [],
    wasAbove: false,
    lastTime: -Infinity,
  });

  // Reset if time jumped backwards
  if (time < stateRef.current.lastTime - 0.05) {
    stateRef.current = { triggers: [], wasAbove: false, lastTime: time };
  }
  stateRef.current.lastTime = time;

  const isAbove = input > threshold;
  let justTriggered = false;

  // Rising-edge: spawn new trigger
  if (isAbove && !stateRef.current.wasAbove) {
    const seed = Math.sin(time * 12.9898 + 78.233) * 43758.5453;
    stateRef.current.triggers.push({
      startTime: time,
      seed: seed - Math.floor(seed),
    });

    if (stateRef.current.triggers.length > maxCount) {
      stateRef.current.triggers.shift();
    }

    justTriggered = true;
  }
  stateRef.current.wasAbove = isAbove;

  // Remove expired and future triggers
  stateRef.current.triggers = stateRef.current.triggers.filter(
    (t) => t.startTime <= time && time - t.startTime < maxAge
  );

  const ages = stateRef.current.triggers.map((t) => time - t.startTime);

  return {
    triggers: stateRef.current.triggers,
    justTriggered,
    ages,
  };
}
