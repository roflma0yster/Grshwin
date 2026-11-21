import { describe, expect, it } from "vitest";
import {
  LOW_CONFIDENCE, ORNAMENT_FOLLOW_WINDOW, QUIET_AMPLITUDE, SAME_NOTE_WINDOW, VOICING_WINDOW, capPerCategory, categorizePitchFindings, categorizeTempoWindow,
  countCategories, orderFindings, type FindingCategory,
} from "@/lib/finding-categories";
import type { NoteFinding } from "@/lib/note-comparison";
import type { DetectedNote } from "@/lib/performance-scoring";

const note = (midi: number, start: number, duration = 0.5, amplitude = 0.7): DetectedNote => ({ midi, start, duration, amplitude });
const identity = [{ baselineTime: 0, performanceTime: 0 }, { baselineTime: 100, performanceTime: 100 }];
const ctx = (reference: DetectedNote[], performance: DetectedNote[], confidence = 75) => ({ reference, performance, alignment: identity, confidence });
const one = (finding: NoteFinding, c: ReturnType<typeof ctx>, extras: NoteFinding[] = []) => categorizePitchFindings([finding, ...extras], c)[0]!;
const extra = (played: number, performanceTime: number): NoteFinding => ({ kind: "extra", baselineTime: performanceTime, performanceTime, played });
const missed = (expected: number, time: number): NoteFinding => ({ kind: "missed", baselineTime: time, performanceTime: time, expected });
const wrong = (expected: number, played: number, time: number): NoteFinding => ({ kind: "wrong", baselineTime: time, performanceTime: time, expected, played });

describe("octave differences", () => {
  it("are style", () => {
    const r = one({ kind: "octave", baselineTime: 1, performanceTime: 1, expected: 60, played: 72 }, ctx([note(60, 1)], [note(72, 1)]));
    expect(r.category).toBe("style");
    expect(r.reason).toContain("different octave");
  });
});

describe("extra notes", () => {
  it("that repeat a pitch class of a reference note nearby are a doubling (style)", () => {
    expect(one(extra(48, 1), ctx([note(60, 1)], [note(48, 1)]))).toMatchObject({ category: "style", reason: "Looks like a doubling or added octave" });
  });
  it("count as a doubling while a reference note is still sounding", () => {
    expect(one(extra(48, 1.5), ctx([note(60, 0, 2)], [note(48, 1.5)])).category).toBe("style");
  });
  it("use a 0.5 s window for the doubling rule", () => {
    const quiet = (t: number) => ctx([note(60, 1, 0.3)], [note(48, t, 0.5, 0.2)]);
    expect(SAME_NOTE_WINDOW).toBe(0.5);
    expect(one(extra(48, 1.5), quiet(1.5)).category).toBe("style");     // exactly at the window
    expect(one(extra(48, 1.51), quiet(1.51)).category).toBe("uncertain"); // just outside, and quiet
  });
  it("that are short and followed within 0.25 s by another note are an ornament (style)", () => {
    const performance = [note(66, 4.88, 0.1, 0.6), note(65, 5.0)];
    expect(one(extra(66, 4.88), ctx([note(65, 5.0)], performance))).toMatchObject({ category: "style", reason: "Looks like an ornament or grace note" });
  });
  it("are not an ornament when nothing follows closely, or when they are long", () => {
    expect(ORNAMENT_FOLLOW_WINDOW).toBe(0.25);
    const none = one(extra(66, 4.88), ctx([note(65, 9)], [note(66, 4.88, 0.1, 0.6), note(65, 5.2)]));
    expect(none.reason).not.toContain("ornament");
    const long = one(extra(66, 4.88), ctx([note(65, 9)], [note(66, 4.88, 0.5, 0.6), note(65, 5.0)]));
    expect(long.reason).not.toContain("ornament");
  });
  it("that are quiet and unexplained are uncertain, not a mistake", () => {
    expect(one(extra(70, 3), ctx([note(60, 9)], [note(70, 3, 0.5, QUIET_AMPLITUDE - 0.01)]))).toMatchObject({ category: "uncertain", reason: "Quiet extra note, may be an echo or a detection artefact" });
  });
  it("that are clear but unexplained are style (an added note), never a mistake", () => {
    expect(one(extra(70, 3), ctx([note(60, 9)], [note(70, 3, 0.5, QUIET_AMPLITUDE)]))).toMatchObject({ category: "style", reason: "A note that is not in the reference (added decoration or voicing)" });
  });
  it("are uncertain when the notes behind them are not available", () => {
    expect(categorizePitchFindings([extra(70, 3)], { alignment: identity, confidence: 90 })[0]!.category).toBe("uncertain");
    expect(one(extra(70, 3), ctx([], [])).category).toBe("uncertain"); // the note cannot be found
  });
});

describe("missed notes", () => {
  it("are style when an unmatched copy of the same note is played within 0.5 s (a rolled chord)", () => {
    const f = missed(67, 2);
    const r = one(f, ctx([note(67, 2)], [note(67, 2.3)]), [extra(67, 2.3)]);
    expect(r).toMatchObject({ category: "style", reason: "Same note at a different moment (rolled chord, rubato or timing)" });
  });
  it("are uncertain when the same note is nearby but already matched to another note", () => {
    const r = one(missed(67, 2), ctx([note(67, 2), note(67, 2.3)], [note(67, 2.3)]));
    expect(r.category).toBe("uncertain");
    expect(r.reason).toContain("already matched");
  });
  it("are a mistake when nothing explains them and the comparison is confident enough", () => {
    expect(LOW_CONFIDENCE).toBe(50);
    expect(one(missed(67, 2), ctx([note(67, 2)], [], 50))).toMatchObject({ category: "mistake", reason: "A note in the reference was not heard" });
    expect(one(missed(67, 2), ctx([note(67, 2)], [], 100)).category).toBe("mistake");
  });
  it("are uncertain, not a mistake, when the comparison confidence is below 50", () => {
    expect(one(missed(67, 2), ctx([note(67, 2)], [], 49))).toMatchObject({ category: "uncertain", reason: "No matching note was heard, but this comparison is low confidence" });
  });
  it("use a 0.5 s window for the same-note rule", () => {
    const at = (t: number) => one(missed(67, 2), ctx([note(67, 2)], [note(67, t)]), [extra(67, t)]).category;
    expect(at(2.5)).toBe("style");
    expect(at(2.51)).toBe("mistake");
  });
  it("are uncertain when the notes behind them are not available", () => {
    expect(categorizePitchFindings([missed(67, 2)], { alignment: identity, confidence: 90 })[0]!.category).toBe("uncertain");
  });
});

describe("wrong notes (a different semitone)", () => {
  it("are style when the played note belongs to the reference chord sounding nearby (a different voicing)", () => {
    const r = one(wrong(64, 67, 1), ctx([note(64, 1), note(67, 1.1)], [note(67, 1)]));
    expect(r).toMatchObject({ category: "style", reason: "Different voicing of the same chord" });
  });
  it("use a 0.3 s window for the voicing rule", () => {
    expect(VOICING_WINDOW).toBe(0.3);
    const at = (gap: number) => one(wrong(64, 67, 1), ctx([note(64, 1), note(67, 1 + gap, 0.2)], [note(67, 1)])).category;
    expect(at(0.3)).toBe("style");
    expect(at(0.31)).toBe("mistake");
  });
  it("are a mistake when nothing explains them and the comparison is confident enough", () => {
    expect(one(wrong(64, 65, 1), ctx([note(64, 1)], [note(65, 1)], 50))).toMatchObject({ category: "mistake", reason: "A different note than the reference" });
  });
  it("are uncertain, not a mistake, when the comparison confidence is below 50", () => {
    expect(one(wrong(64, 65, 1), ctx([note(64, 1)], [note(65, 1)], 49)).category).toBe("uncertain");
  });
  it("are uncertain when the reference notes are not available", () => {
    expect(categorizePitchFindings([wrong(64, 65, 1)], { alignment: identity, confidence: 90 })[0]!.category).toBe("uncertain");
  });
});

describe("tempo windows", () => {
  it("are not findings when within 10% of the overall pace", () => {
    expect(categorizeTempoWindow(1, 1, 1)).toBeNull();
    expect(categorizeTempoWindow(1.1, 1, 1)).toBeNull();
    expect(categorizeTempoWindow(0.9, 1, 1)).toBeNull();
  });
  it("are style (rubato) when the pace changes smoothly from the neighbours", () => {
    expect(categorizeTempoWindow(1.12, 1.05, 1.2)).toMatchObject({ category: "style", reason: "Smooth tempo shaping (rubato)" });
    expect(categorizeTempoWindow(0.85, 0.9, 0.8)?.category).toBe("style");
  });
  it("are a mistake when the pace changes suddenly", () => {
    expect(categorizeTempoWindow(0.6, 1, 0.6)).toMatchObject({ category: "mistake", reason: "A sudden change in pace" });
  });
  it("are uncertain in between (a change of 15% to 30%)", () => {
    expect(categorizeTempoWindow(0.8, 1.0, 0.8)?.category).toBe("uncertain");
    expect(categorizeTempoWindow(1.2, 0.95, 1.2)?.category).toBe("uncertain");
  });
  it("use the largest change to either neighbour", () => {
    expect(categorizeTempoWindow(0.7, 0.72, 1.1)?.category).toBe("mistake"); // smooth on one side, sudden on the other
  });
  it("are uncertain when there are no neighbours to compare with", () => {
    expect(categorizeTempoWindow(0.8)?.category).toBe("uncertain");
  });
});

describe("ordering, counting and capping", () => {
  const f = (category: FindingCategory, baselineTime: number) => ({ category, baselineTime });
  it("counts each category", () => {
    expect(countCategories([f("mistake", 0), f("style", 1), f("style", 2), f("uncertain", 3)])).toEqual({ mistake: 1, style: 2, uncertain: 1 });
    expect(countCategories([])).toEqual({ mistake: 0, style: 0, uncertain: 0 });
  });
  it("puts mistakes first, then style, then not sure, and orders each group by weight then time", () => {
    const ordered = orderFindings([f("uncertain", 0), f("style", 1), f("mistake", 5), f("mistake", 2)]);
    expect(ordered.map((x) => `${x.category}@${x.baselineTime}`)).toEqual(["mistake@2", "mistake@5", "style@1", "uncertain@0"]);
    const weighted = orderFindings([f("mistake", 1), f("mistake", 2)], (x) => (x.baselineTime === 2 ? 5 : 1));
    expect(weighted.map((x) => x.baselineTime)).toEqual([2, 1]);
  });
  it("keeps at most N of each category but does not touch order", () => {
    const items = [f("mistake", 1), f("mistake", 2), f("mistake", 3), f("style", 4), f("style", 5)];
    expect(capPerCategory(items, 2).map((x) => x.baselineTime)).toEqual([1, 2, 4, 5]);
  });
});
