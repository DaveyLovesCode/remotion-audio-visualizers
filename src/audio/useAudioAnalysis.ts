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
  /** Overall energy across all frequencies */
  energy: number;
  /** Whether audio data is still loading */
  isLoading: boolean;
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
      bands.forEach((b) => (emptyBands[b.name] = 0));
      return { bands: emptyBands, energy: 0, isLoading: true };
    }

    // Get raw frequency visualization data
    const frequencyData = visualizeAudio({
      fps,
      frame,
      audioData,
      numberOfSamples,
      smoothing,
    });

    // Extract energy for each band
    const bandValues: Record<string, number> = {};
    let totalEnergy = 0;

    bandIndices.forEach(({ name, startBin, endBin }) => {
      let sum = 0;
      let count = 0;

      for (let i = startBin; i <= endBin && i < frequencyData.length; i++) {
        // frequencyData values are 0-1, but often clustered low
        // Square root to expand dynamic range
        sum += Math.sqrt(frequencyData[i]);
        count++;
      }

      // Average and normalize
      const avg = count > 0 ? sum / count : 0;
      // Boost and clamp to 0-1
      const normalized = Math.min(1, avg * 2);
      bandValues[name] = normalized;
      totalEnergy += normalized;
    });

    // Overall energy is average of all bands
    const energy = totalEnergy / bandIndices.length;

    return { bands: bandValues, energy, isLoading: false };
  }, [audioData, bandIndices, frame, fps, numberOfSamples, smoothing, bands]);

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
