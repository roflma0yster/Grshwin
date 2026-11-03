import { describe, expect, it } from "vitest";
import { compareFeatures, extractFeatures, validateAudioDuration, validateAudioFile } from "@/lib/audio-comparison";

const rate = 11025;
function melody(notes = [261.63, 329.63, 392, 523.25], speed = 1, volume = 0.5, silence = 0) {
  const duration = silence + notes.length * 0.8 / speed;
  const samples = new Float32Array(Math.ceil(duration * rate));
  for (let i = Math.ceil(silence * rate); i < samples.length; i++) {
    const t = i / rate - silence, slot = Math.floor(t / (0.8 / speed));
    samples[i] = volume * Math.sin(2 * Math.PI * (notes[slot] ?? 0) * t);
  }
  return extractFeatures(samples, rate, 0, samples.length / rate);
}
describe("Audio recording comparison", () => {
  it("measures identical recordings at 100% similarity and matching tempo", () => {
    const a = melody(); expect(compareFeatures(a, a)).toMatchObject({ similarity: 100, tempoRatio: 1, timingDeviationMs: 0 });
  });
  it("normalizes volume changes", () => { expect(compareFeatures(melody(), melody(undefined, 1, 0.1)).similarity).toBeGreaterThan(98); });
  it("aligns recordings with leading silence", () => { expect(compareFeatures(melody(), melody(undefined, 1, 0.5, 1)).similarity).toBeGreaterThan(90); });
  it("detects a faster performance", () => { const r = compareFeatures(melody(), melody(undefined, 1.3)); expect(r.tempoRatio).toBeGreaterThan(1.15); expect(r.similarity).toBeGreaterThan(80); });
  it("detects a slower performance", () => { expect(compareFeatures(melody(), melody(undefined, 0.8)).tempoRatio).toBeLessThan(0.9); });
  it("reduces similarity for different pitches", () => { expect(compareFeatures(melody(), melody([277.18, 349.23, 415.3, 554.37])).similarity).toBeLessThan(70); });
  it("rejects silence and invalid trims", () => {
    expect(() => extractFeatures(new Float32Array(rate * 2), rate, 0, 2)).toThrow("audible");
    expect(() => extractFeatures(new Float32Array(rate * 2), rate, 1, 0)).toThrow("half a second");
  });
  it("rejects noise-only recordings", () => {
    let seed = 7; const samples = Float32Array.from({ length: rate * 2 }, () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; });
    expect(() => extractFeatures(samples, rate, 0, 2)).toThrow("noisy");
  });
  it("accepts WAV MP3 M4A and rejects unsupported files", () => {
    for (const name of ["piano.wav", "piano.mp3", "piano.m4a"]) expect(() => validateAudioFile({ name, size: 100 })).not.toThrow();
    expect(() => validateAudioFile({ name: "score.pdf", size: 100 })).toThrow();
  });
  it("enforces the 20 MB file limit", () => { expect(() => validateAudioFile({ name: "piano.wav", size: 20 * 1024 * 1024 + 1 })).toThrow(); });
  it("enforces the two-minute duration limit", () => { expect(() => validateAudioDuration(121)).toThrow(); expect(() => validateAudioDuration(120)).not.toThrow(); });
});