export interface AudioFrame {
  // Normalized 0-1 values for each frequency band
  bass: number;      // 20-150 Hz (kick drum territory)
  lowMid: number;    // 150-400 Hz
  mid: number;       // 400-2000 Hz
  highMid: number;   // 2000-6000 Hz
  high: number;      // 6000-20000 Hz

  // Overall energy
  energy: number;

  // Beat detection
  isBeat: boolean;
  beatIntensity: number;
}

export interface AudioAnalysis {
  bpm: number;
  frames: AudioFrame[];
}
