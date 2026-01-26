import { useCallback, useMemo } from "react";
import { useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import {
  getAudioData,
  useAudioData,
  visualizeAudio,
} from "@remotion/media-utils";

/**
 * Frequency band configuration
 * Specify min/max Hz to extract energy from that range
 */
export interface FrequencyBand {
  name: string;
  minHz: number;
  maxHz: number;
}

/**
 * Default frequency bands for music visualization
 */
export const DEFAULT_BANDS: FrequencyBand[] = [
  { name: "sub", minHz: 20, maxHz: 60 },      // Sub bass
  { name: "kick", minHz: 60, maxHz: 150 },    // Kick drum fundamental
  { name: "bass", minHz: 100, maxHz: 500 },   // Bass + kick harmonics (your requested range)
  { name: "lowMid", minHz: 500, maxHz: 2000 },
  { name: "mid", minHz: 2000, maxHz: 4000 },
  { name: "high", minHz: 4000, maxHz: 12000 },
  { name: "air", minHz: 12000, maxHz: 20000 },
];

/**
 * Kick-focused preset (100-500 Hz as requested)
 */
export const KICK_BAND: FrequencyBand = {
  name: "kick",
  minHz: 100,
  maxHz: 500,
};

export interface AudioAnalysisResult {
  /** Raw frequency values for each configured band (0-1 normalized) */
  bands: Record<string, number>;
  /** Fill percentages for each configured band (peak-based, thresholded) */
  fill: Record<string, number>;
  /** Overall energy across all frequencies */
  energy: number;
  /** Whether audio data is still loading */
  isLoading: boolean;
}

export interface GateConfig {
  /** Values below this are zeroed (noise floor) */
  floor: number;
  /** Values above this are clipped to 1 (default: 1) */
  ceiling?: number;
}

/** Apply gate: values below floor → 0, remap floor-ceiling to 0-1 */
function applyGate(value: number, gate: GateConfig): number {
  const { floor, ceiling = 1 } = gate;
  if (value <= floor) return 0;
  if (value >= ceiling) return 1;
  return (value - floor) / (ceiling - floor);
}

/**
 * Fill Percentage calculation - mimics FreqReact's range box behavior
 *
 * Instead of averaging, this finds the peak in the frequency range and
 * calculates what percentage of the "threshold region" it fills.
 *
 * Think of it like a range box on a spectrum:
 * - floor = bottom of box (signal must breach this to register)
 * - ceiling = top of box (signal at this level = 100%)
 * - If peak < floor → 0
 * - If peak > ceiling → 1
 * - Otherwise → proportional fill
 *
 * This gives clean 0→100% on kick drums because:
 * 1. Low-level noise never breaches the floor
 * 2. When the kick hits, it shoots up and fills the threshold region
 */
function calculateFillPercentage(
  frequencyData: number[],
  startBin: number,
  endBin: number,
  floor: number,
  ceiling: number
): number {
  // Find the peak value in the range (not average!)
  let peak = 0;
  for (let i = startBin; i <= endBin && i < frequencyData.length; i++) {
    const value = frequencyData[i];
    if (value > peak) peak = value;
  }

  // Apply threshold: below floor = 0, scale floor-ceiling to 0-1
  if (peak <= floor) return 0;
  if (peak >= ceiling) return 1;
  return (peak - floor) / (ceiling - floor);
}

interface UseAudioAnalysisOptions {
  /** Path to audio file (use staticFile()) */
  src: string;
  /** Frequency bands to analyze */
  bands?: FrequencyBand[];
  /** Number of FFT samples (higher = more precision, default 2048) */
  numberOfSamples?: number;
  /** Enable smoothing between frames */
  smoothing?: boolean;
  /** Gate to cut noise floor and normalize range (for averaged bands) */
  gate?: GateConfig;
  /**
   * Fill percentage gate (for peak-based fill values).
   * Default: { floor: 0.2, ceiling: 0.6 }
   */
  fillGate?: GateConfig;
}

/**
 * Hook to extract frequency band energy from audio at the current frame
 *
 * @example
 * ```tsx
 * const { bands, energy } = useAudioAnalysis({
 *   src: staticFile("music.wav"),
 *   bands: [KICK_BAND], // Just kick drum
 * });
 *
 * // Use bands.kick to drive visuals
 * const kickIntensity = bands.kick;
 * ```
 */
export function useAudioAnalysis({
  src,
  bands = DEFAULT_BANDS,
  numberOfSamples = 2048,
  smoothing = true,
  gate,
  fillGate = { floor: 0.2, ceiling: 0.6 },
}: UseAudioAnalysisOptions): AudioAnalysisResult {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Load audio data
  const audioData = useAudioData(src);

  // Calculate frequency bin indices for each band
  const bandIndices = useMemo(() => {
    if (!audioData) return null;

    const { sampleRate } = audioData;
    const binCount = numberOfSamples / 2;
    const hzPerBin = sampleRate / numberOfSamples;

    return bands.map((band) => ({
      name: band.name,
      startBin: Math.floor(band.minHz / hzPerBin),
      endBin: Math.min(Math.ceil(band.maxHz / hzPerBin), binCount - 1),
    }));
  }, [audioData, bands, numberOfSamples]);

  // Get frequency data for current frame
  const result = useMemo((): AudioAnalysisResult => {
    if (!audioData || !bandIndices) {
      // Return zeros while loading
      const emptyBands: Record<string, number> = {};
      const emptyFill: Record<string, number> = {};
      bands.forEach((b) => {
        emptyBands[b.name] = 0;
        emptyFill[b.name] = 0;
      });
      return { bands: emptyBands, fill: emptyFill, energy: 0, isLoading: true };
    }

    // Get raw frequency visualization data - SINGLE FFT call
    const frequencyData = visualizeAudio({
      fps,
      frame,
      audioData,
      numberOfSamples,
      smoothing,
    });

    // Extract both averaged bands AND peak-based fill from the same FFT data
    const bandValues: Record<string, number> = {};
    const fillValues: Record<string, number> = {};
    let totalEnergy = 0;

    const { floor: fillFloor, ceiling: fillCeiling = 1 } = fillGate;

    bandIndices.forEach(({ name, startBin, endBin }) => {
      let sum = 0;
      let peak = 0;
      let count = 0;

      for (let i = startBin; i <= endBin && i < frequencyData.length; i++) {
        const raw = frequencyData[i];
        // Track peak for fill percentage
        if (raw > peak) peak = raw;
        // Square root to expand dynamic range for averaging
        sum += Math.sqrt(raw);
        count++;
      }

      // AVERAGED value (original behavior)
      const avg = count > 0 ? sum / count : 0;
      let normalized = Math.min(1, avg * 2);
      if (gate) {
        normalized = applyGate(normalized, gate);
      }
      bandValues[name] = normalized;
      totalEnergy += normalized;

      // FILL PERCENTAGE (peak-based, thresholded)
      fillValues[name] = calculateFillPercentage(
        frequencyData, startBin, endBin, fillFloor, fillCeiling
      );
    });

    // Overall energy is average of all bands
    const energy = totalEnergy / bandIndices.length;

    return { bands: bandValues, fill: fillValues, energy, isLoading: false };
  }, [audioData, bandIndices, frame, fps, numberOfSamples, smoothing, bands, gate, fillGate]);

  return result;
}

/**
 * Simpler hook for single frequency band extraction
 *
 * @example
 * ```tsx
 * const kick = useFrequencyBand(staticFile("music.wav"), 100, 500);
 * ```
 */
export function useFrequencyBand(
  src: string,
  minHz: number,
  maxHz: number,
  options?: { numberOfSamples?: number; smoothing?: boolean }
): number {
  const { bands, isLoading } = useAudioAnalysis({
    src,
    bands: [{ name: "target", minHz, maxHz }],
    ...options,
  });

  return isLoading ? 0 : bands.target;
}

/**
 * Pre-built hook for kick drum detection (100-500 Hz)
 */
export function useKickDrum(
  src: string,
  options?: { numberOfSamples?: number; smoothing?: boolean }
): number {
  return useFrequencyBand(src, 100, 500, {
    numberOfSamples: options?.numberOfSamples ?? 1024,
    smoothing: options?.smoothing ?? false, // No smoothing = more reactive
  });
}

// =============================================================================
// FILL PERCENTAGE HOOKS
// =============================================================================
// These mimic FreqReact's range box behavior for clean, thresholded detection

export interface FillPercentageConfig {
  /** Minimum frequency in Hz */
  minHz: number;
  /** Maximum frequency in Hz */
  maxHz: number;
  /**
   * Threshold floor (0-1). Signal must exceed this to register at all.
   * Think of this as the bottom of the range box.
   * Lower = more sensitive, Higher = only big peaks register.
   * Default: 0.3
   */
  floor?: number;
  /**
   * Threshold ceiling (0-1). Signal at this level = 100%.
   * Think of this as the top of the range box.
   * Default: 0.8
   */
  ceiling?: number;
  /** FFT size. Default: 2048 */
  numberOfSamples?: number;
  /** Apply temporal smoothing. Default: false (snappy response) */
  smoothing?: boolean;
}

/**
 * Fill Percentage hook - clean, thresholded frequency detection
 *
 * Mimics FreqReact's range box behavior:
 * - Finds the PEAK in the frequency range (not average)
 * - Returns 0 if peak is below floor threshold
 * - Returns 0-1 proportional fill if peak is between floor and ceiling
 * - Returns 1 if peak exceeds ceiling
 *
 * This gives clean 0→100% on kick drums because noise never breaches
 * the floor, and kicks shoot up to fill the threshold region.
 *
 * @example
 * ```tsx
 * // Clean kick drum detection
 * const kick = useFillPercentage(staticFile("music.wav"), {
 *   minHz: 60,
 *   maxHz: 150,
 *   floor: 0.25,  // Ignore anything below 25% amplitude
 *   ceiling: 0.7, // 70% amplitude = 100% fill
 * });
 * // kick goes from 0 to 1 cleanly on each kick drum hit
 * ```
 */
export function useFillPercentage(
  src: string,
  config: FillPercentageConfig
): number {
  const {
    minHz,
    maxHz,
    floor = 0.3,
    ceiling = 0.8,
    numberOfSamples = 2048,
    smoothing = false,
  } = config;

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(src);

  const result = useMemo(() => {
    if (!audioData) return 0;

    const { sampleRate } = audioData;
    const binCount = numberOfSamples / 2;
    const hzPerBin = sampleRate / numberOfSamples;

    const startBin = Math.floor(minHz / hzPerBin);
    const endBin = Math.min(Math.ceil(maxHz / hzPerBin), binCount - 1);

    const frequencyData = visualizeAudio({
      fps,
      frame,
      audioData,
      numberOfSamples,
      smoothing,
    });

    return calculateFillPercentage(frequencyData, startBin, endBin, floor, ceiling);
  }, [audioData, frame, fps, numberOfSamples, smoothing, minHz, maxHz, floor, ceiling]);

  return result;
}

/**
 * Pre-configured fill percentage for kick drum
 *
 * Tuned for typical EDM/electronic kick drums:
 * - 60-150 Hz (kick fundamental)
 * - Floor at 0.25 (ignore low-level rumble)
 * - Ceiling at 0.7 (typical kick peak = 100%)
 *
 * Adjust floor/ceiling based on your track's kick loudness.
 */
export function useKickFill(
  src: string,
  options?: { floor?: number; ceiling?: number }
): number {
  return useFillPercentage(src, {
    minHz: 60,
    maxHz: 150,
    floor: options?.floor ?? 0.25,
    ceiling: options?.ceiling ?? 0.7,
    numberOfSamples: 2048,
    smoothing: false,
  });
}

/**
 * Pre-configured fill percentage for bass (wider range)
 */
export function useBassFill(
  src: string,
  options?: { floor?: number; ceiling?: number }
): number {
  return useFillPercentage(src, {
    minHz: 40,
    maxHz: 200,
    floor: options?.floor ?? 0.2,
    ceiling: options?.ceiling ?? 0.65,
    numberOfSamples: 2048,
    smoothing: false,
  });
}
