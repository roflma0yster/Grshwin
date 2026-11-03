// Browser-only. Turns recorded audio into note events with Spotify's Basic Pitch.
// The library and TensorFlow.js are heavy, so they are imported on demand and the model is loaded once.
// NOTE: the Basic Pitch calls below follow its README from memory and have not been run;
// check them against the installed version (see the comments marked VERIFY).
import type { DetectedNote } from "@/lib/performance-scoring";

export const BASIC_PITCH_SAMPLE_RATE = 22050;
/** Model files are copied here from the package by `npm run setup:basic-pitch`. */
export const BASIC_PITCH_MODEL_URL = "/basic-pitch/model.json";

export class TranscriptionError extends Error {}

type Model = { evaluateModel: (audio: Float32Array, onComplete: (frames: number[][], onsets: number[][], contours: number[][]) => void, onProgress: (p: number) => void) => Promise<void> };
type Lib = { BasicPitch: new (modelUrl: string) => Model; outputToNotesPoly: (frames: number[][], onsets: number[][], onsetThresh?: number, frameThresh?: number, minNoteLen?: number) => unknown[]; noteFramesToTime: (notes: never) => { pitchMidi: number; startTimeSeconds: number; durationSeconds: number; amplitude: number }[] };

let model: Promise<{ lib: Lib; model: Model }> | null = null;
function loadModel() {
  model ??= (async () => {
    try {
      const lib = (await import("@spotify/basic-pitch")) as unknown as Lib; // VERIFY export names
      return { lib, model: new lib.BasicPitch(BASIC_PITCH_MODEL_URL) };
    } catch {
      model = null; // allow a retry
      throw new TranscriptionError("The note-detection model could not be loaded. Check your connection and try again.");
    }
  })();
  return model;
}

/** Mono, 22,050 Hz, as the model requires. */
export async function resampleForModel(samples: Float32Array, sampleRate: number): Promise<Float32Array> {
  if (sampleRate === BASIC_PITCH_SAMPLE_RATE) return samples;
  const length = Math.max(1, Math.ceil((samples.length * BASIC_PITCH_SAMPLE_RATE) / sampleRate));
  const offline = new OfflineAudioContext(1, length, BASIC_PITCH_SAMPLE_RATE);
  const buffer = offline.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  const source = offline.createBufferSource();
  source.buffer = buffer; source.connect(offline.destination); source.start();
  return (await offline.startRendering()).getChannelData(0);
}

/** `start` in the result is seconds from the beginning of the recording. */
export async function transcribe(samples: Float32Array, sampleRate: number, onProgress?: (fraction: number) => void): Promise<DetectedNote[]> {
  const audio = await resampleForModel(samples, sampleRate);
  const { lib, model: pitch } = await loadModel();
  const frames: number[][] = [];
  const onsets: number[][] = [];
  try {
    await pitch.evaluateModel(audio, (f, o) => { for (const x of f) frames.push(x); for (const x of o) onsets.push(x); }, (p) => onProgress?.(p)); // VERIFY signature
  } catch {
    throw new TranscriptionError("The recording could not be analysed. Please try again.");
  }
  const events = lib.noteFramesToTime(lib.outputToNotesPoly(frames, onsets, 0.25, 0.25, 5) as never);
  return events.map((n) => ({ midi: n.pitchMidi, start: n.startTimeSeconds, duration: n.durationSeconds, amplitude: n.amplitude }));
}
