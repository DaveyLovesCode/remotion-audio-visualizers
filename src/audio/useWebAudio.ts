import { useEffect, useRef, useState, useCallback } from "react";

export interface FrequencyBand {
  name: string;
  minHz: number;
  maxHz: number;
}

export interface GateConfig {
  floor: number;
  ceiling?: number;
}

export interface WebAudioAnalysis {
  bands: Record<string, number>;
  fill: Record<string, number>;
  energy: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
}

interface UseWebAudioOptions {
  src: string;
  bands?: FrequencyBand[];
  fftSize?: number;
  gate?: GateConfig;
  fillGate?: GateConfig;
  visualLeadTime?: number; // seconds to delay audio (visuals react ahead)
}

const DEFAULT_BANDS: FrequencyBand[] = [
  { name: "kick", minHz: 120, maxHz: 141 },
  { name: "bass", minHz: 80, maxHz: 250 },
  { name: "lowMid", minHz: 250, maxHz: 2000 },
  { name: "mid", minHz: 2000, maxHz: 4000 },
  { name: "high", minHz: 4000, maxHz: 12000 },
];

function applyGate(value: number, gate: GateConfig): number {
  const { floor, ceiling = 1 } = gate;
  if (value <= floor) return 0;
  if (value >= ceiling) return 1;
  return (value - floor) / (ceiling - floor);
}

export function useWebAudio({
  src,
  bands = DEFAULT_BANDS,
  fftSize = 4096,
  gate = { floor: 0.2, ceiling: 0.6 },
  fillGate = { floor: 0.89, ceiling: 0.99 },
  visualLeadTime = 0,
}: UseWebAudioOptions): WebAudioAnalysis {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const frequencyDataRef = useRef<Uint8Array | null>(null);
  const bandIndicesRef = useRef<{ name: string; startBin: number; endBin: number }[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    bands: Record<string, number>;
    fill: Record<string, number>;
    energy: number;
  }>({
    bands: {},
    fill: {},
    energy: 0,
  });

  // Initialize audio context and analyser
  useEffect(() => {
    const audioElement = new Audio();
    audioElement.loop = true;
    audioElement.preload = "auto";
    audioElementRef.current = audioElement;

    // Log loading errors
    audioElement.addEventListener("error", () => {
      const err = audioElement.error;
      console.error("Audio error code:", err?.code, "message:", err?.message);
    });

    audioElement.addEventListener("canplaythrough", () => {
      console.log("Audio loaded and ready to play");
    });

    // Set src after adding listeners
    audioElement.src = src;
    audioElement.load();

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0;
    analyserRef.current = analyser;

    const source = audioContext.createMediaElementSource(audioElement);
    source.connect(analyser);

    // Delay audio output so visuals react ahead of sound
    if (visualLeadTime > 0) {
      const delayNode = audioContext.createDelay(visualLeadTime);
      delayNode.delayTime.value = visualLeadTime;
      analyser.connect(delayNode);
      delayNode.connect(audioContext.destination);
    } else {
      analyser.connect(audioContext.destination);
    }
    sourceRef.current = source;

    frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);

    // Calculate band indices
    const sampleRate = audioContext.sampleRate;
    const binCount = analyser.frequencyBinCount;
    const hzPerBin = sampleRate / fftSize;

    bandIndicesRef.current = bands.map((band) => ({
      name: band.name,
      startBin: Math.floor(band.minHz / hzPerBin),
      endBin: Math.min(Math.ceil(band.maxHz / hzPerBin), binCount - 1),
    }));

    // Handle play/pause state
    audioElement.addEventListener("play", () => setIsPlaying(true));
    audioElement.addEventListener("pause", () => setIsPlaying(false));
    audioElement.addEventListener("ended", () => setIsPlaying(false));

    return () => {
      audioElement.pause();
      audioElement.removeAttribute("src");
      audioElement.load(); // Reset without triggering error
      source.disconnect();
      analyser.disconnect();
      audioContext.close();
    };
  }, [src, fftSize, visualLeadTime]);

  // Analysis loop using requestAnimationFrame
  useEffect(() => {
    let animationId: number;

    const analyze = () => {
      const analyser = analyserRef.current;
      const frequencyData = frequencyDataRef.current;
      const bandIndices = bandIndicesRef.current;

      if (analyser && frequencyData && bandIndices.length > 0) {
        analyser.getByteFrequencyData(frequencyData as Uint8Array<ArrayBuffer>);

        const bandValues: Record<string, number> = {};
        const fillValues: Record<string, number> = {};
        let totalEnergy = 0;

        const { floor: fillFloor, ceiling: fillCeiling = 1 } = fillGate;

        bandIndices.forEach(({ name, startBin, endBin }) => {
          let sum = 0;
          let peak = 0;
          let count = 0;

          for (let i = startBin; i <= endBin && i < frequencyData.length; i++) {
            const raw = frequencyData[i] / 255; // Normalize to 0-1
            if (raw > peak) peak = raw;
            sum += Math.sqrt(raw);
            count++;
          }

          // Averaged value
          const avg = count > 0 ? sum / count : 0;
          let normalized = Math.min(1, avg * 2);
          if (gate) {
            normalized = applyGate(normalized, gate);
          }
          bandValues[name] = normalized;
          totalEnergy += normalized;

          // Fill percentage (peak-based)
          if (peak <= fillFloor) {
            fillValues[name] = 0;
          } else if (peak >= fillCeiling) {
            fillValues[name] = 1;
          } else {
            fillValues[name] = (peak - fillFloor) / (fillCeiling - fillFloor);
          }
        });

        const energy = totalEnergy / bandIndices.length;

        setAnalysisResult({ bands: bandValues, fill: fillValues, energy });
      }

      animationId = requestAnimationFrame(analyze);
    };

    animationId = requestAnimationFrame(analyze);
    return () => cancelAnimationFrame(animationId);
  }, [gate, fillGate]);

  const play = useCallback(async () => {
    const audioContext = audioContextRef.current;
    const audioElement = audioElementRef.current;

    if (!audioElement || !audioContext) {
      console.error("Audio not initialized");
      return;
    }

    try {
      if (audioContext.state === "suspended") {
        await audioContext.resume();
        console.log("AudioContext resumed");
      }
      await audioElement.play();
      console.log("Audio playing");
    } catch (err) {
      console.error("Play error:", err);
    }
  }, []);

  const pause = useCallback(() => {
    audioElementRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  return {
    ...analysisResult,
    isPlaying,
    play,
    pause,
    toggle,
  };
}
