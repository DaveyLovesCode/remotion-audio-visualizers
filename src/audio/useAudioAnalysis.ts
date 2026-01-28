import { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData } from "@remotion/media-utils";

// =============================================================================
// RAW FFT IMPLEMENTATION
// Matches Web Audio API's getByteFrequencyData behavior exactly
// =============================================================================

/**
 * Compute FFT magnitude spectrum from audio samples
 * Returns values 0-1 matching Web Audio API's getByteFrequencyData / 255
 */
function computeFFT(samples: Float32Array, fftSize: number): Float32Array {
  const n = fftSize;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);

  // Apply Blackman window and copy samples
  for (let i = 0; i < n; i++) {
    const windowVal = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) +
                      0.08 * Math.cos((4 * Math.PI * i) / (n - 1));
    real[i] = (samples[i] ?? 0) * windowVal;
    imag[i] = 0;
  }

  // In-place Cooley-Tukey FFT
  fftInPlace(real, imag, n);

  // Compute magnitude spectrum (only need first half - positive frequencies)
  const binCount = n / 2;
  const magnitudes = new Float32Array(binCount);

  // Web Audio API defaults: minDecibels = -100, maxDecibels = -30
  const minDecibels = -100;
  const maxDecibels = -30;
  const dbRange = maxDecibels - minDecibels; // 70

  for (let i = 0; i < binCount; i++) {
    // Normalize magnitude by FFT size (standard FFT normalization)
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / n;
    const db = 20 * Math.log10(mag + 1e-10);
    const normalized = Math.max(0, Math.min(1, (db - minDecibels) / dbRange));
    magnitudes[i] = normalized;
  }

  return magnitudes;
}

/** In-place Cooley-Tukey radix-2 FFT */
function fftInPlace(real: Float32Array, imag: Float32Array, n: number): void {
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Cooley-Tukey iterative FFT
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = -Math.PI / halfLen;
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      const wpr = Math.cos(angleStep);
      const wpi = Math.sin(angleStep);
      for (let k = 0; k < halfLen; k++) {
        const idx1 = i + k;
        const idx2 = i + k + halfLen;
        const tr = wr * real[idx2] - wi * imag[idx2];
        const ti = wr * imag[idx2] + wi * real[idx2];
        real[idx2] = real[idx1] - tr;
        imag[idx2] = imag[idx1] - ti;
        real[idx1] += tr;
        imag[idx1] += ti;
        const newWr = wr * wpr - wi * wpi;
        wi = wr * wpi + wi * wpr;
        wr = newWr;
      }
    }
  }
}

/**
 * Get audio samples for a specific frame
 */
function getSamplesForFrame(
  channelData: Float32Array,
  sampleRate: number,
  frame: number,
  fps: number,
  fftSize: number
): Float32Array {
  const samplesPerFrame = sampleRate / fps;
  const startSample = Math.floor(frame * samplesPerFrame);

  const samples = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const idx = startSample + i;
    samples[i] = idx < channelData.length ? channelData[idx] : 0;
  }
  return samples;
}

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
  /** Debug info (only when _returnDebug is true) */
  _debug?: { kickPeak: number };
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
  frequencyData: Float32Array | number[],
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
  /** Return debug info with raw peak values */
  _returnDebug?: boolean;
  /** Frame offset into the audio file (for trimming start) */
  frameOffset?: number;
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
  _returnDebug = false,
  frameOffset = 0,
}: UseAudioAnalysisOptions): AudioAnalysisResult {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const offsetFrame = frame + frameOffset;

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

    // Get raw audio samples and compute our own FFT
    // This matches Web Audio API behavior exactly (unlike Remotion's visualizeAudio)
    const channelData = audioData.channelWaveforms[0]; // Mono or left channel
    const samples = getSamplesForFrame(channelData, audioData.sampleRate, offsetFrame, fps, numberOfSamples);
    const frequencyData = computeFFT(samples, numberOfSamples);

    // Extract both averaged bands AND peak-based fill from the same FFT data
    const bandValues: Record<string, number> = {};
    const fillValues: Record<string, number> = {};
    const peakValues: Record<string, number> = {}; // Raw peaks for debugging
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

      // Store raw peak for debugging
      peakValues[name] = peak;

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

    // Debug: capture first band's peak (assumed to be kick)
    const _debug = _returnDebug ? { kickPeak: peakValues[bands[0]?.name] ?? 0 } : undefined;

    return { bands: bandValues, fill: fillValues, energy, isLoading: false, _debug };
  }, [audioData, bandIndices, offsetFrame, fps, numberOfSamples, bands, gate, fillGate, _returnDebug]);

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

    // Use our own FFT that matches Web Audio API
    const channelData = audioData.channelWaveforms[0];
    const samples = getSamplesForFrame(channelData, sampleRate, frame, fps, numberOfSamples);
    const frequencyData = computeFFT(samples, numberOfSamples);

    return calculateFillPercentage(frequencyData, startBin, endBin, floor, ceiling);
  }, [audioData, frame, fps, numberOfSamples, minHz, maxHz, floor, ceiling]);

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
