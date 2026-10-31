import { describe, expect, it } from "vitest";
import { validateScore } from "@/lib/score-validation";
import { INTERVALS, CHORDS, performanceAccuracy } from "@/lib/learning";
import { demoMusicXml, parseNotes, practiceNotes } from "@/lib/music";

describe("Music learning", () => {
  it("represents a perfect fifth as seven semitones", () => {
    expect(INTERVALS.find((i) => i.label === "Perfect 5th")?.semitones).toBe(7);
  });
  it("represents major and minor triads accurately", () => {
    expect(CHORDS[0].offsets).toEqual([0, 4, 7]);
    expect(CHORDS[1].offsets).toEqual([0, 3, 7]);
  });
  it("counts missed exercise notes against accuracy", () => {
    expect(performanceAccuracy(6, 8)).toBe(75);
    expect(performanceAccuracy(0, 8)).toBe(0);
  });
  it("validates a partwise score and strips its external DTD", () => {
    expect(validateScore(demoMusicXml("Practice"))).not.toContain("DOCTYPE");
  });
  it("rejects invalid and unsupported score files", () => {
    expect(() => validateScore("<score-partwise>")).toThrow();
    expect(() => validateScore("<html><body>hello</body></html>")).toThrow();
    expect(() => validateScore('<!ENTITY unsafe "value"><score-partwise/>')).toThrow();
  });
  it("parses both hands and all eight demo bars", () => {
    const result = parseNotes(demoMusicXml("Practice"));
    expect(result.measureStarts).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32]);
    expect(result.notes.some((n) => n.staff === 2)).toBe(true);
  });
  it("plays all parts against the same bar boundaries", () => {
    const result = parseNotes('<score-partwise><part id="P1"><measure><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure><measure><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note></measure></part><part id="P2"><measure><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note></measure><measure><note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration></note></measure></part></score-partwise>');
    expect(result.measureStarts).toEqual([0, 4, 8]);
    expect(result.notes.map((note) => note.start)).toEqual([0, 4, 0, 4]);
  });
  it("sustains tied notes without playing them twice", () => {
    const result = parseNotes('<score-partwise><part><measure><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/></note></measure><measure><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="stop"/></note></measure></part></score-partwise>');
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]?.duration).toBe(8);
  });
  it("clips notes to a loop and selects the requested hand", () => {
    const result = practiceNotes([
      { pitch: "C4", start: 0, duration: 8, staff: 1, measure: 0 },
      { pitch: "C3", start: 4, duration: 4, staff: 2, measure: 1 },
      { pitch: "D4", start: 8, duration: 1, staff: 1, measure: 2 },
    ], 4, 6, "right");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ pitch: "C4", start: 0, duration: 2 });
  });
  it("escapes repertoire titles in generated excerpts", () => {
    expect(validateScore(demoMusicXml("A & B <Study>"))).toContain("A &amp; B &lt;Study&gt;");
  });
});