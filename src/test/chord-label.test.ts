import { describe, expect, it } from "vitest";
import { accidental, chordLabel, tidyChords } from "@/lib/chord-label";

describe("chord labels", () => {
  it("translates MusicXML kinds to the usual symbols", () => {
    expect(chordLabel({ rootStep: "C", kind: "major" })).toBe("C");
    expect(chordLabel({ rootStep: "C", kind: "major-seventh" })).toBe("Cmaj7");
    expect(chordLabel({ rootStep: "F", kind: "dominant" })).toBe("F7");
    expect(chordLabel({ rootStep: "E", kind: "minor-seventh" })).toBe("Em7");
    expect(chordLabel({ rootStep: "A", kind: "minor" })).toBe("Am");
    expect(chordLabel({ rootStep: "B", kind: "half-diminished" })).toBe("Bm7♭5");
    expect(chordLabel({ rootStep: "D", kind: "suspended-fourth" })).toBe("Dsus4");
  });
  it("writes accidentals on the root with proper signs", () => {
    expect(chordLabel({ rootStep: "E", rootAlter: -1, kind: "dominant" })).toBe("E♭7");
    expect(chordLabel({ rootStep: "F", rootAlter: 1, kind: "minor" })).toBe("F♯m");
    expect(accidental(0)).toBe("");
    expect(accidental(-2)).toBe("♭♭");
  });
  it("uses the score's own display text when it has one", () => {
    expect(chordLabel({ rootStep: "G", kind: "major-seventh", kindText: "Δ7" })).toBe("GΔ7");
    expect(chordLabel({ rootStep: "G", kind: "major-seventh", kindText: "  " })).toBe("Gmaj7");
  });
  it("adds a bass note for slash chords", () => {
    expect(chordLabel({ rootStep: "C", kind: "major", bassStep: "E" })).toBe("C/E");
    expect(chordLabel({ rootStep: "D", kind: "minor", bassStep: "B", bassAlter: -1 })).toBe("Dm/B♭");
  });
  it("never shows raw XML words for kinds it does not know", () => {
    expect(chordLabel({ rootStep: "C", kind: "pedal" })).toBe("C");
    expect(chordLabel({ rootStep: "H", kind: "major" })).toBe("");
  });
  it("sorts chords and drops repeats from multiple parts", () => {
    const out = tidyChords([{ beat: 4, label: "F7" }, { beat: 0, label: "G" }, { beat: 4, label: "F7" }, { beat: 8, label: "" }]);
    expect(out).toEqual([{ beat: 0, label: "G" }, { beat: 4, label: "F7" }]);
  });
});
