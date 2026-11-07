import { describe, it, expect } from "vitest";
import { audioLevel, isSilent } from "@/lib/audio-levels";
import { transcribe } from "@/lib/transcription";
describe("transcription guards", () => {
  it("skips the model for silence", async () => { expect(isSilent(new Float32Array(22050))).toBe(true); await expect(transcribe(new Float32Array(22050), 22050)).rejects.toThrow("silent"); });
  it("measures microphone RMS", () => { expect(audioLevel(new Float32Array([0.5, -0.5]))).toBe(0.5); });
  it("limits note analysis to two minutes", async () => { await expect(transcribe(new Float32Array(121), 1)).rejects.toThrow("2 minutes"); });
  it("honors cancellation before loading", async () => { const controller = new AbortController(); controller.abort(); await expect(transcribe(new Float32Array(10), 1, undefined, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" }); });
});