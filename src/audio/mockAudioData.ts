import type { AudioFrame } from "./types";

/**
 * Generates mock audio data simulating an EDM track at ~128 BPM
 * Replace this with real audio analysis when you have your track
 */
export function generateMockAudioData(
  totalFrames: number,
  fps: number
): AudioFrame[] {
  const bpm = 128;
  const framesPerBeat = (60 / bpm) * fps;

  const frames: AudioFrame[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const time = i / fps;
    const beatPhase = (i % framesPerBeat) / framesPerBeat;

    // Kick drum hits on every beat (4 on the floor)
    const kickEnvelope = Math.exp(-beatPhase * 8);
    const isBeat = beatPhase < 0.1;

    // Snare on 2 and 4
    const beatInMeasure = Math.floor(i / framesPerBeat) % 4;
    const snareHit = (beatInMeasure === 1 || beatInMeasure === 3) && beatPhase < 0.15;

    // Hi-hats on 8ths
    const eighthPhase = (i % (framesPerBeat / 2)) / (framesPerBeat / 2);
    const hihatEnvelope = Math.exp(-eighthPhase * 12);

    // Build-up and drop structure (every 16 bars = 64 beats)
    const measureInSection = Math.floor(i / framesPerBeat / 4) % 16;
    const isBuildup = measureInSection >= 12 && measureInSection < 16;
    const isDrop = measureInSection < 8;

    // Buildup riser effect
    const buildupIntensity = isBuildup
      ? (measureInSection - 12) / 4 + (i % (framesPerBeat * 4)) / (framesPerBeat * 4) / 4
      : 0;

    // Bass wobble (half-time feel in drops)
    const wobblePhase = (i % (framesPerBeat * 2)) / (framesPerBeat * 2);
    const bassWobble = isDrop ? 0.3 + 0.3 * Math.sin(wobblePhase * Math.PI * 4) : 0;

    // Frequency bands
    const bass = Math.min(1, kickEnvelope * (isDrop ? 1 : 0.5) + bassWobble + buildupIntensity * 0.5);
    const lowMid = Math.min(1, kickEnvelope * 0.5 + (snareHit ? 0.6 : 0) + buildupIntensity * 0.3);
    const mid = Math.min(1, (snareHit ? 0.7 : 0.2) + buildupIntensity * 0.6 + Math.random() * 0.1);
    const highMid = Math.min(1, hihatEnvelope * 0.4 + (snareHit ? 0.5 : 0) + buildupIntensity * 0.7);
    const high = Math.min(1, hihatEnvelope * 0.6 + buildupIntensity * 0.8 + Math.random() * 0.15);

    const energy = (bass + lowMid + mid + highMid + high) / 5;

    frames.push({
      bass,
      lowMid,
      mid,
      highMid,
      high,
      energy,
      isBeat,
      beatIntensity: isBeat ? (isDrop ? 1 : 0.6) : 0,
    });
  }

  return frames;
}
