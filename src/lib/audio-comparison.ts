import FFT from "fft.js";
import DynamicTimeWarping from "dynamic-time-warping";

export const AUDIO_MAX_BYTES = 20 * 1024 * 1024;
export const AUDIO_MAX_SECONDS = 300;
export type AudioFrame = { time: number; chroma: number[]; rms: number };
export type AudioFeatures = { frames: AudioFrame[]; start: number; end: number; tonalFraction: number };
export type ComparisonResult = { version: 1; similarity: number; tempoRatio: number; timingDeviationMs: number; baselineActiveSeconds: number; performanceActiveSeconds: number; warnings: string[]; segments: { baselineTime: number; performanceTime: number; similarity: number }[]; noteFeedback?: import("@/lib/note-comparison").NoteComparison; noteUnavailable?: string; confidence?: number };

export function validateAudioFile(file: { name: string; size: number }) {
  if (!/\.(wav|mp3|m4a)$/i.test(file.name)) throw new Error("Choose a WAV, MP3 or M4A recording.");
  if (!file.size || file.size > AUDIO_MAX_BYTES) throw new Error("Each recording must be between 1 byte and 20 MB.");
}
export function validateAudioDuration(duration: number) {
  if (!Number.isFinite(duration) || duration < 0.5 || duration > AUDIO_MAX_SECONDS) throw new Error("Choose a recording between 0.5 seconds and 5 minutes long.");
}

/** Normalized pitch-class energy: an acoustic resemblance measure, not transcription. */
export function extractFeatures(samples: Float32Array, sampleRate: number, start: number, end: number): AudioFeatures {
  if (start < 0 || end > samples.length / sampleRate + 0.001 || end - start < 0.5) throw new Error("Select at least half a second within the recording.");
  const size = 2048, hop = Math.max(size, Math.round(sampleRate * 0.15));
  const fft = new FFT(size), spectrum = fft.createComplexArray(), window = new Float32Array(size);
  const all: (AudioFrame & { tonal: boolean })[] = [];
  for (let offset = Math.floor(start * sampleRate); offset + size <= Math.floor(end * sampleRate); offset += hop) {
    let power = 0;
    for (let k = 0; k < size; k++) { const x = samples[offset + k] ?? 0; power += x * x; window[k] = x * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / (size - 1))); }
    fft.realTransform(spectrum, window);
    const chroma = Array.from({ length: 12 }, () => 0);
    let sum = 0, logSum = 0, bins = 0;
    for (let k = 1; k < size / 2; k++) {
      const frequency = k * sampleRate / size;
      if (frequency < 80 || frequency > 2500) continue;
      const energy = Number(spectrum[2 * k]) ** 2 + Number(spectrum[2 * k + 1]) ** 2 + 1e-12;
      sum += energy; logSum += Math.log(energy); bins++;
      const pitchClass = ((Math.round(69 + 12 * Math.log2(frequency / 440)) % 12) + 12) % 12;
      chroma[pitchClass] = (chroma[pitchClass] ?? 0) + energy;
    }
    const norm = Math.sqrt(chroma.reduce((s, v) => s + v * v, 0));
    all.push({ time: offset / sampleRate, chroma: chroma.map((v) => norm ? v / norm : 0), rms: Math.sqrt(power / size), tonal: Math.exp(logSum / Math.max(1, bins)) / (sum / Math.max(1, bins)) < 0.25 });
  }
  const peak = Math.max(0, ...all.map((f) => f.rms));
  const active = all.filter((f) => f.rms > Math.max(0.0001, peak * 0.08));
  const first = active[0], last = active.at(-1);
  if (!first || !last || active.length < 3) throw new Error("Too little audible music. Choose a longer, clearer excerpt.");
  const frames = all.filter((f) => f.time >= first.time && f.time <= last.time);
  const tonalFraction = active.filter((f) => f.tonal).length / active.length;
  if (tonalFraction < 0.3) throw new Error("This recording is too noisy or lacks clear musical pitches for comparison.");
  return { frames, start: first.time, end: last.time + hop / sampleRate, tonalFraction };
}
function similarity(a: AudioFrame, b: AudioFrame) { return Math.max(0, Math.min(1, a.chroma.reduce((s, v, i) => s + v * (b.chroma[i] ?? 0), 0))); }
export function compareFeatures(baseline: AudioFeatures, performance: AudioFeatures): ComparisonResult {
  if (!baseline.frames.length || !performance.frames.length) throw new Error("Both recordings need audible music.");
  const baselineDuration = baseline.end - baseline.start, performanceDuration = performance.end - performance.start;
  // A tiny normalized-time penalty resolves ambiguous sustained-note paths.
  const dtw = new DynamicTimeWarping(baseline.frames, performance.frames, (a, b) => 1 - similarity(a, b) + 0.01 * Math.abs((a.time - baseline.start) / baselineDuration - (b.time - performance.start) / performanceDuration));
  const path = dtw.getPath();
  const segments = path.flatMap(([i, j]) => {
    const a = baseline.frames[i], b = performance.frames[j];
    return a && b ? [{ baselineTime: a.time, performanceTime: b.time, similarity: Math.round(similarity(a, b) * 100) }] : [];
  });
  const deviation = segments.reduce((sum, s) => sum + Math.abs((s.performanceTime - performance.start) - (s.baselineTime - baseline.start) * performanceDuration / baselineDuration), 0) / segments.length;
  const score = Math.round(segments.reduce((sum, s) => sum + s.similarity, 0) / segments.length);
  const warnings = ["Pitch-pattern similarity is not note accuracy; octaves and chords can sound similar. Timing reflects alignment, not beat-by-beat scoring."];
  if (Math.min(baseline.tonalFraction, performance.tonalFraction) < 0.7) warnings.push("Background noise may reduce reliability.");
  if (score < 60) warnings.push("The recordings may contain different music; alignment may be unreliable.");
  return { version: 1, similarity: score, tempoRatio: baselineDuration / performanceDuration, timingDeviationMs: Math.round(deviation * 1000), baselineActiveSeconds: baselineDuration, performanceActiveSeconds: performanceDuration, warnings, segments };
}

export async function decodeRecording(file: Blob) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    validateAudioDuration(buffer.duration);
    const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * 11025), 11025);
    const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination); source.start();
    const mono = await offline.startRendering();
    return { samples: mono.getChannelData(0), sampleRate: mono.sampleRate, duration: buffer.duration };
  } catch (error) {
    if (error instanceof Error && error.message.includes("seconds")) throw error;
    throw new Error("This recording could not be decoded. Try exporting it as WAV or MP3.");
  } finally { await context.close(); }
}