/**
 * Audio Analysis Script
 *
 * Run this to analyze your audio file and generate frame-by-frame frequency data.
 * This creates a JSON file that can be imported into the visualizer.
 *
 * Usage:
 *   1. Place your audio file in the public folder (e.g., public/music.mp3)
 *   2. Run: npm run analyze
 *   3. The script will generate src/audio/audioAnalysis.json
 *   4. Update AudioVisualizer.tsx to import this data instead of mock data
 *
 * Note: This script uses the Web Audio API via a headless browser approach.
 * For Node.js, you'll need additional packages like 'audiobuffer-to-wav' and 'decode-audio-data-fast'.
 *
 * Alternative: Use a browser-based analyzer (included in public/analyze.html)
 */

import type { AudioFrame, AudioAnalysis } from "./types";

// This is a placeholder - the actual analysis should be done in a browser environment
// or using Node.js audio processing libraries

export function analyzeAudioBuffer(
  audioBuffer: AudioBuffer,
  fps: number = 30
): AudioAnalysis {
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const totalFrames = Math.ceil(duration * fps);
  const samplesPerFrame = Math.floor(sampleRate / fps);

  // Get raw audio data (mono or left channel)
  const rawData = audioBuffer.getChannelData(0);

  const frames: AudioFrame[] = [];

  // FFT size for frequency analysis
  const fftSize = 2048;

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const startSample = frameIndex * samplesPerFrame;
    const endSample = Math.min(startSample + fftSize, rawData.length);

    // Extract samples for this frame
    const frameSamples = rawData.slice(startSample, endSample);

    // Simple energy calculation
    let energy = 0;
    for (let i = 0; i < frameSamples.length; i++) {
      energy += frameSamples[i] * frameSamples[i];
    }
    energy = Math.sqrt(energy / frameSamples.length);

    // Simple frequency band estimation based on zero crossings and energy
    // For proper analysis, use Web Audio API's AnalyserNode
    const bassEnergy = calculateBandEnergy(frameSamples, 0, 0.1);
    const lowMidEnergy = calculateBandEnergy(frameSamples, 0.1, 0.25);
    const midEnergy = calculateBandEnergy(frameSamples, 0.25, 0.5);
    const highMidEnergy = calculateBandEnergy(frameSamples, 0.5, 0.75);
    const highEnergy = calculateBandEnergy(frameSamples, 0.75, 1.0);

    // Simple beat detection based on bass energy spike
    const isBeat = frameIndex > 0 && bassEnergy > 0.3 &&
      bassEnergy > (frames[frameIndex - 1]?.bass ?? 0) * 1.5;

    frames.push({
      bass: Math.min(1, bassEnergy * 2),
      lowMid: Math.min(1, lowMidEnergy * 2),
      mid: Math.min(1, midEnergy * 2),
      highMid: Math.min(1, highMidEnergy * 2),
      high: Math.min(1, highEnergy * 2),
      energy: Math.min(1, energy * 3),
      isBeat,
      beatIntensity: isBeat ? Math.min(1, bassEnergy * 3) : 0,
    });
  }

  // Estimate BPM from beat intervals
  const beatFrames = frames
    .map((f, i) => (f.isBeat ? i : -1))
    .filter((i) => i >= 0);
  let bpm = 128; // Default

  if (beatFrames.length > 2) {
    const intervals = [];
    for (let i = 1; i < beatFrames.length; i++) {
      intervals.push(beatFrames[i] - beatFrames[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    bpm = Math.round((60 * fps) / avgInterval);
  }

  return { bpm, frames };
}

function calculateBandEnergy(samples: Float32Array, startRatio: number, endRatio: number): number {
  const start = Math.floor(samples.length * startRatio);
  const end = Math.floor(samples.length * endRatio);

  let energy = 0;
  for (let i = start; i < end; i++) {
    energy += samples[i] * samples[i];
  }

  return Math.sqrt(energy / (end - start));
}

// Export for browser usage
if (typeof window !== "undefined") {
  (window as unknown as { analyzeAudioBuffer: typeof analyzeAudioBuffer }).analyzeAudioBuffer = analyzeAudioBuffer;
}
