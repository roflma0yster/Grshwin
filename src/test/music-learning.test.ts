import { describe, expect, it } from "vitest";
import { validateScore } from "@/lib/score-validation";
import { INTERVALS, CHORDS, performanceAccuracy } from "@/lib/learning";
import { demoMusicXml, parseNotes } from "@/lib/music";

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
});