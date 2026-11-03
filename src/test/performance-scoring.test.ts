import { describe, expect, it } from "vitest";
import { scorePerformance, type DetectedNote } from "@/lib/performance-scoring";

const MELODY = [60, 62, 64, 65, 67, 65, 64, 60];
// At 60 BPM a beat is 1 s and the melody starts 4 beats (4 s) after the first click.
const at = (slot: number, offsetMs = 0, midi = MELODY[slot]!): DetectedNote => ({ midi: midi, start: 4 + slot + offsetMs / 1000, duration: 0.4, amplitude: 0.8 });
const perfect = () => MELODY.map((_, i) => at(i));

describe("scorePerformance", () => {
  it("scores a perfect run", () => {
    const r = scorePerformance(MELODY, 60, perfect());
    expect(r.hits.every((h) => h?.correct && h.offset === 0)).toBe(true);
    expect(r.extraNotes).toBe(0);
  });
  it("marks a wrong pitch as incorrect but present", () => {
    const notes = perfect(); notes[2] = at(2, 0, 66);
    expect(scorePerformance(MELODY, 60, notes).hits[2]).toEqual({ correct: false, offset: 0 });
  });
  it("leaves a skipped slot missed without shifting later notes", () => {
    const notes = perfect().filter((_, i) => i !== 3);
    const r = scorePerformance(MELODY, 60, notes);
    expect(r.hits[3]).toBeNull();
    expect(r.hits[4]?.correct).toBe(true);
  });
  it("reports rushing as negative offsets", () => {
    const r = scorePerformance(MELODY, 60, MELODY.map((_, i) => at(i, -80)));
    expect(r.hits.every((h) => h?.correct && h.offset === -80)).toBe(true);
  });
  it("reports dragging as positive offsets", () => {
    const r = scorePerformance(MELODY, 60, MELODY.map((_, i) => at(i, 120)));
    expect(r.hits.every((h) => h?.correct && h.offset === 120)).toBe(true);
  });
  it("counts a note after the last slot as extra", () => {
    const r = scorePerformance(MELODY, 60, [...perfect(), at(8, 0, 60)]);
    expect(r.extraNotes).toBe(1);
    expect(r.hits.filter(Boolean)).toHaveLength(8);
  });
  it("keeps the closest of two notes in one slot and counts the other as extra", () => {
    const r = scorePerformance(MELODY, 60, [...perfect(), at(1, 300, 70)]);
    expect(r.hits[1]).toEqual({ correct: true, offset: 0 });
    expect(r.extraNotes).toBe(1);
  });
  it("ignores notes during the count-in (the app's own clicks)", () => {
    const clicks: DetectedNote[] = [0, 1, 2, 3].map((s) => ({ midi: 76, start: s, duration: 0.08, amplitude: 0.5 }));
    const r = scorePerformance(MELODY, 60, [...clicks, ...perfect()]);
    expect(r.extraNotes).toBe(0);
    expect(r.hits.every((h) => h?.correct)).toBe(true);
  });
  it("latency correction moves a uniformly late performance back into its slots", () => {
    const late = MELODY.map((_, i) => at(i, 600));
    const uncorrected = scorePerformance(MELODY, 60, late);
    expect(uncorrected.hits.filter((h) => h?.correct).length).toBeLessThan(8);
    const corrected = scorePerformance(MELODY, 60, late, { latencyMs: 600 });
    expect(corrected.hits.every((h) => h?.correct && h.offset === 0)).toBe(true);
    expect(corrected.extraNotes).toBe(0);
  });
  it("handles no notes", () => {
    expect(scorePerformance(MELODY, 60, [])).toEqual({ hits: MELODY.map(() => null), extraNotes: 0 });
  });
  it("scales slot timing with tempo", () => {
    const beat = 0.5; // 120 BPM
    const notes: DetectedNote[] = MELODY.map((m, i) => ({ midi: m, start: (4 + i) * beat, duration: 0.2, amplitude: 0.8 }));
    expect(scorePerformance(MELODY, 120, notes).hits.every((h) => h?.correct && h.offset === 0)).toBe(true);
  });
});
