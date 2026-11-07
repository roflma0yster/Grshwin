// Loaded only from user-triggered browser handlers. Both scoring tabs share this pipeline.
import type { DetectedNote } from "@/lib/performance-scoring";
import { isSilent } from "@/lib/audio-levels";

export const BASIC_PITCH_SAMPLE_RATE = 22050;
export const BASIC_PITCH_MODEL_URL = "/basic-pitch/model.json";
export const NOTE_ANALYSIS_MAX_SECONDS = 120;
export class TranscriptionError extends Error {
  constructor(message: string, public details = "") { super(message); this.name = "TranscriptionError"; }
}
type Loaded = { lib: typeof import("@spotify/basic-pitch"); tf: typeof import("@tensorflow/tfjs"); pitch: import("@spotify/basic-pitch").BasicPitch };
let loaded: Promise<Loaded> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let assets: Promise<void> | null = null;
const abort = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError"); };

export function checkModelAssets(): Promise<void> {
  assets ??= (async () => {
    const response = await fetch(BASIC_PITCH_MODEL_URL);
    const text = await response.text();
    if (!response.ok || text.trim().startsWith("<")) throw new Error(`Model JSON unavailable (HTTP ${response.status}; ${response.headers.get("content-type")}). The host may be returning a page instead of model files.`);
    const json = JSON.parse(text) as { weightsManifest?: { paths: string[] }[] };
    const paths = json.weightsManifest?.flatMap((m) => m.paths);
    if (!paths?.length) throw new Error("Model JSON has no weight manifest.");
    for (const path of paths) {
      const weight = await fetch(`/basic-pitch/${path}`);
      if (!weight.ok || weight.headers.get("content-type")?.includes("text/html")) throw new Error(`Model weight ${path} unavailable (HTTP ${weight.status}).`);
      await weight.arrayBuffer();
    }
  })().catch((error: unknown) => { assets = null; console.error("Basic Pitch assets", error); throw new TranscriptionError("Note detection files are unavailable. Please try again after the app is updated.", String(error)); });
  return assets;
}
async function loadModel(cpu = false): Promise<Loaded> {
  if (!loaded) loaded = (async () => {
    await checkModelAssets();
    const tf = await import("@tensorflow/tfjs");
    try { if (cpu || !await tf.setBackend("webgl")) await tf.setBackend("cpu"); await tf.ready(); }
    catch { await tf.setBackend("cpu"); await tf.ready(); }
    const lib = await import("@spotify/basic-pitch");
    const pitch = new lib.BasicPitch(BASIC_PITCH_MODEL_URL);
    await pitch.model;
    return { tf, lib, pitch };
  })().catch((error: unknown) => { loaded = null; throw error; });
  return loaded;
}
async function discardModel() {
  const prior = loaded; loaded = null;
  if (prior) try { (await (await prior).pitch.model).dispose(); } catch { /* already failed */ }
}
export async function resampleForModel(samples: Float32Array, sampleRate: number): Promise<Float32Array> {
  if (sampleRate === BASIC_PITCH_SAMPLE_RATE) return samples;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(samples.length * BASIC_PITCH_SAMPLE_RATE / sampleRate)), BASIC_PITCH_SAMPLE_RATE);
  const buffer = offline.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination); source.start();
  return (await offline.startRendering()).getChannelData(0);
}
export type TranscriptionOptions = { signal?: AbortSignal; start?: number; end?: number };
export function transcribe(samples: Float32Array, sampleRate: number, onProgress?: (fraction: number) => void, options: TranscriptionOptions = {}): Promise<DetectedNote[]> {
  const job = queue.catch(() => {}).then(async () => {
    abort(options.signal);
    const start = options.start ?? 0, end = options.end ?? samples.length / sampleRate;
    if (end - start > NOTE_ANALYSIS_MAX_SECONDS) throw new TranscriptionError("Note feedback needs an excerpt of 2 minutes or less. Select a shorter excerpt.");
    if (!Number.isFinite(start + end) || start < 0 || end <= start || end > samples.length / sampleRate + 0.001) throw new TranscriptionError("Select an excerpt within the recording.");
    const excerpt = samples.slice(Math.floor(start * sampleRate), Math.floor(end * sampleRate));
    if (isSilent(excerpt)) throw new TranscriptionError("The recording is silent or too quiet. Check your microphone and try again.", "Recording RMS is below 0.0003; model skipped.");
    const audio = await resampleForModel(excerpt, sampleRate);
    async function run(cpu: boolean) {
      const { tf, lib, pitch } = await loadModel(cpu); abort(options.signal);
      const notes: DetectedNote[] = [];
      // Short overlapping chunks bound memory and allow cancellation/UI updates between inference calls.
      const chunk = BASIC_PITCH_SAMPLE_RATE * 3, overlap = BASIC_PITCH_SAMPLE_RATE / 2;
      for (let offset = 0; offset < audio.length; offset += chunk) {
        abort(options.signal);
        const from = Math.max(0, offset - overlap), to = Math.min(audio.length, offset + chunk + overlap);
        const frames: number[][] = [], onsets: number[][] = [];
        // The installed library leaves intermediate tensors alive. A serialized scope releases them,
        // including on errors, while model weights created before the scope remain cached.
        tf.engine().startScope();
        try { await pitch.evaluateModel(audio.slice(from, to), (f, o) => { frames.push(...f); onsets.push(...o); }, () => {}); }
        finally { tf.engine().endScope(); }
        abort(options.signal);
        for (const n of lib.noteFramesToTime(lib.outputToNotesPoly(frames, onsets, 0.25, 0.25, 5))) {
          const at = from / BASIC_PITCH_SAMPLE_RATE + n.startTimeSeconds;
          if (at >= offset / BASIC_PITCH_SAMPLE_RATE && at < (offset + chunk) / BASIC_PITCH_SAMPLE_RATE) notes.push({ midi: n.pitchMidi, start: start + at, duration: n.durationSeconds, amplitude: n.amplitude });
        }
        onProgress?.(Math.min(1, (offset + chunk) / audio.length));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return notes.sort((a, b) => a.start - b.start);
    }
    try { return await run(false); }
    catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      console.error("Basic Pitch inference", error); await discardModel();
      try { return await run(true); }
      catch (retry) { await discardModel(); if (retry instanceof DOMException && retry.name === "AbortError") throw retry; console.error("Basic Pitch CPU inference", retry); throw new TranscriptionError("The recording could not be analysed. Please try again.", `${String(error)}; CPU retry: ${String(retry)}`); }
    }
  });
  queue = job; return job;
}