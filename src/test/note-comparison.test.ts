import { describe, it, expect } from "vitest";
import { compareNotes, alignmentMap } from "@/lib/note-comparison";
const n = (midi: number, start = 0, duration = 0.5, amplitude = 0.8) => ({ midi, start, duration, amplitude });
const alignment = [{ baselineTime: 0, performanceTime: 2 }, { baselineTime: 10, performanceTime: 22 }];
describe("aligned note comparison", () => {
  it("matches exact semitones using time alignment", () => { expect(compareNotes([n(60, 1)], [n(60, 4)], alignment)).toMatchObject({ matched: 1, accuracy: 100 }); });
  it("matches chord voices without depending on their order", () => { expect(compareNotes([n(60), n(64), n(67)], [n(67, 2), n(60, 2), n(64, 2)], alignment).matched).toBe(3); });
  it("identifies octave errors", () => { expect(compareNotes([n(60)], [n(72, 2)], alignment)).toMatchObject({ wrong: 1, octaveErrors: 1, accuracy: 0 }); });
  it("identifies wrong semitones", () => { expect(compareNotes([n(64)], [n(63, 2)], alignment).findings[0]?.kind).toBe("wrong"); });
  it("counts missed and extra notes", () => { expect(compareNotes([n(60), n(64, 1)], [n(60, 2), n(67, 8)], alignment)).toMatchObject({ matched: 1, missed: 1, extra: 1, accuracy: 33 }); });
  it("ignores short or quiet artefacts", () => { expect(compareNotes([n(60)], [n(60, 2), n(72, 2, 0.02), n(65, 2, 1, 0.02)], alignment).extra).toBe(0); });
  it("does not match distant onsets", () => { expect(compareNotes([n(60)], [n(60, 3)], alignment)).toMatchObject({ matched: 0, missed: 1, extra: 1 }); });
  it("averages repeated alignment timestamps", () => { expect(alignmentMap([{ baselineTime: 0, performanceTime: 0 }, { baselineTime: 0, performanceTime: 2 }, { baselineTime: 2, performanceTime: 3 }])(1)).toBe(2); });
});