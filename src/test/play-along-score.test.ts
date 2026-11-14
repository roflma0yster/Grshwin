import { describe, expect, it } from "vitest";
import { parseNotes } from "@/lib/music";
import { buildRollModel } from "@/lib/piano-roll-draw";
import { TWO_HAND_SCORE } from "./fixtures/two-hand-score";

// These expectations were first checked by running the real parser and renderer in Chromium.
const parsed = parseNotes(TWO_HAND_SCORE);

describe("reading a score for the falling notes", () => {
  it("reads four bars and both hands", () => {
    expect(parsed.measureStarts).toEqual([0, 4, 8, 12, 16]);
    expect(parsed.notes).toHaveLength(66);
    expect([...new Set(parsed.notes.map((n) => n.staff))].sort()).toEqual([1, 2]);
  });
  it("reads a finger number for every fingered note", () => {
    expect(parsed.notes.every((n) => n.fingering !== undefined && n.fingering >= 1 && n.fingering <= 5)).toBe(true);
    expect(parsed.notes.find((n) => n.pitch === "C5" && n.start === 1.5)?.fingering).toBe(1);
  });
  it("reads chord symbols as players write them, at the start of each bar", () => {
    expect(parsed.chords).toEqual([{ beat: 0, label: "G" }, { beat: 4, label: "Cmaj7" }, { beat: 8, label: "F7" }, { beat: 12, label: "Em7" }]);
  });
  it("leaves fingering and chords empty for a score that has none", () => {
    const plain = parseNotes(TWO_HAND_SCORE.replace(/<harmony>.*?<\/harmony>/g, "").replace(/<notations>.*?<\/notations>/g, ""));
    expect(plain.chords).toEqual([]);
    expect(plain.notes.every((n) => n.fingering === undefined)).toBe(true);
    expect(plain.notes).toHaveLength(66);
  });
});

describe("the roll model for a practice range", () => {
  it("covers the whole piece by default", () => {
    const m = buildRollModel(parsed, false, 1, 4);
    expect(m.span).toBe(16);
    expect(m.notes).toHaveLength(66);
    expect(m.bars.map((b) => b.number)).toEqual([1, 2, 3, 4]);
    expect(m.chordGroups).toHaveLength(11);
    expect(m.maxDuration).toBe(2);
  });
  it("rebases a loop range so beat 0 is the start of the loop", () => {
    const m = buildRollModel(parsed, true, 2, 3);
    expect(m.span).toBe(8);
    expect(m.bars).toEqual([{ beat: 0, number: 2 }, { beat: 4, number: 3 }]);
    expect(m.chords).toEqual([{ beat: 0, label: "Cmaj7" }, { beat: 4, label: "F7" }]);
    expect(m.notes).toHaveLength(36);
    expect(Math.min(...m.notes.map((n) => n.start))).toBe(0);
    expect(Math.max(...m.notes.map((n) => n.start + n.duration))).toBe(8);
    expect(m.chordGroups).toHaveLength(7);
  });
  it("builds a keyboard that starts and ends on white keys and fits the piece", () => {
    const m = buildRollModel(parsed, false, 1, 4);
    expect(m.keys[0]!.black).toBe(false);
    expect(m.keys.at(-1)!.black).toBe(false);
    expect(m.keys[0]!.midi).toBeLessThanOrEqual(36);
    expect(m.keys.at(-1)!.midi).toBeGreaterThanOrEqual(76);
    expect(m.totalWhite).toBe(28);
  });
});
