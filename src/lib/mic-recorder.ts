// Browser-only microphone capture. Call only from a user gesture (the Start button).
export type MicErrorCode = "denied" | "no-device" | "unsupported" | "failed";

export class MicError extends Error {
  code: MicErrorCode;
  constructor(code: MicErrorCode, message: string) { super(message); this.code = code; }
}

export type MicRecording = {
  sampleRate: number;
  /** performance.now() when capture began (sample 0 of the returned audio, give or take a few ms). */
  startedAt: number;
  stop: () => Promise<Float32Array>;
  cancel: () => void;
};

const WORKLET = `class PcmRecorder extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("pcm-recorder", PcmRecorder);`;

export async function startMicRecording(): Promise<MicRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
    throw new MicError("unsupported", "This browser cannot record from a microphone. Use the Classic method instead.");
  }
  let stream: MediaStream;
  try {
    // These filters are made for speech and distort piano notes.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") throw new MicError("denied", "Microphone access was blocked. Allow it in your browser's site settings and try again.");
    if (name === "NotFoundError" || name === "DevicesNotFoundError") throw new MicError("no-device", "No microphone was found. Connect one and try again.");
    throw new MicError("failed", "The microphone could not be started. Please try again.");
  }
  const ctx = new AudioContext();
  const chunks: Float32Array[] = [];
  let done = false;
  const nodes: AudioNode[] = [];
  const release = () => {
    if (done) return; done = true;
    stream.getTracks().forEach((t) => t.stop());
    nodes.forEach((n) => n.disconnect());
    void ctx.close().catch(() => {});
  };
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const recorder = new AudioWorkletNode(ctx, "pcm-recorder");
    recorder.port.onmessage = (e: MessageEvent<Float32Array>) => { if (!done) chunks.push(e.data); };
    // Some browsers only run a node that reaches the output, so route it through a muted gain.
    const mute = ctx.createGain(); mute.gain.value = 0;
    source.connect(recorder); recorder.connect(mute); mute.connect(ctx.destination);
    nodes.push(source, recorder, mute);
  } catch {
    release();
    throw new MicError("failed", "The microphone could not be started. Please try again.");
  }
  const startedAt = performance.now();
  return {
    sampleRate: ctx.sampleRate,
    startedAt,
    cancel: release,
    stop: async () => {
      release();
      const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0;
      for (const c of chunks) { out.set(c, offset); offset += c.length; }
      return out;
    },
  };
}
