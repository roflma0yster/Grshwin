import { describe, expect, it } from "vitest";
import { MAX_STORED_PER_CATEGORY, detailedFeedback, dynamicsFeedback, readStoredComparison, tempoFeedback, type DetailedComparison } from "@/lib/comparison-feedback";
import { alignment, features, lesson, mistakeVariants, resultFor, styleVariants, type Variant } from "./fixtures/style-variants";

const run = (v: Variant, confidence = 75): DetailedComparison => detailedFeedback(resultFor(v, confidence), features(), features(), { reference: lesson(), performance: v.notes });
const byName = (all: Variant[], name: string) => all.find((v) => v.name === name)!;

describe("professional-style performances with no mistakes", () => {
  for (const v of styleVariants()) {
    it(`${v.name}: no likely mistakes in pitch or tempo, and no advice to fix anything`, () => {
      const d = run(v);
      expect(d.pitch.counts.mistake).toBe(0);
      expect(d.tempo.counts.mistake).toBe(0);
      expect(d.dynamics.counts.mistake).toBe(0);
      expect(d.noMistakes).toBe(true);
      expect(d.coaching).toEqual([]);
    });
  }

  it("the categories are doing the work: the raw comparison still sees differences in the stylistic ones", () => {
    for (const name of ["chords rolled wide", "bass doubled an octave lower", "grace-note ornaments", "different voicing"]) {
      const v = byName(styleVariants(), name);
      const raw = resultFor(v).noteFeedback!;
      expect(raw.missed + raw.extra + raw.wrong + raw.octaveErrors).toBeGreaterThan(0);
      const d = run(v);
      expect(d.pitch.counts.style + d.pitch.counts.uncertain).toBeGreaterThan(0);
    }
  });

  it("wide rolled chords are explained as the same notes at a different moment", () => {
    const d = run(byName(styleVariants(), "chords rolled wide"));
    expect(d.pitch.findings.some((f) => f.category === "style" && f.reason.includes("different moment"))).toBe(true);
  });

  it("a steady slower take has no tempo findings and shows the overall difference as a neutral line", () => {
    const d = run(byName(styleVariants(), "steady 15% slower"));
    expect(d.tempo.findings).toEqual([]);
    expect(d.tempo.overall).toContain("slower overall");
  });

  it("smooth rubato may produce findings, but only as style", () => {
    const d = run(byName(styleVariants(), "smooth rubato"));
    for (const f of d.tempo.findings) expect(f.category).not.toBe("mistake");
  });

  it("offers one optional suggestion instead of advice when there are only stylistic differences", () => {
    const d = run(byName(styleVariants(), "chords rolled wide"));
    expect(d.noMistakes).toBe(true);
    expect(d.styleSuggestion).toContain("If you want to match the reference more closely");
  });
});

describe("performances with real mistakes are still caught", () => {
  it("three wrong notes are reported as likely mistakes", () => {
    const d = run(byName(mistakeVariants(), "three wrong notes"));
    expect(d.pitch.counts.mistake).toBeGreaterThanOrEqual(3);
    expect(d.pitch.findings.filter((f) => f.category === "mistake").every((f) => f.text.includes("was detected where the reference has"))).toBe(true);
  });
  it("three missing notes are reported as likely mistakes", () => {
    const d = run(byName(mistakeVariants(), "three missing notes"));
    expect(d.pitch.counts.mistake).toBeGreaterThanOrEqual(3);
  });
  it("an abrupt slowdown is reported as a likely mistake in tempo", () => {
    const d = run(byName(mistakeVariants(), "an abrupt slowdown"));
    expect(d.tempo.counts.mistake).toBeGreaterThanOrEqual(1);
    expect(d.tempo.findings[0]?.category).toBe("mistake");
  });
  it("advice comes from the mistakes, and the 'no clear mistakes' message is off", () => {
    const wrong = run(byName(mistakeVariants(), "three wrong notes"));
    expect(wrong.noMistakes).toBe(false);
    expect(wrong.coaching.join(" ")).toContain("note mistakes");
    expect(wrong.styleSuggestion).toBeUndefined();
    const slow = run(byName(mistakeVariants(), "an abrupt slowdown"));
    expect(slow.coaching.join(" ")).toContain("pace changes");
  });
  it("with low confidence the same wrong notes become 'not sure' instead of mistakes", () => {
    const d = run(byName(mistakeVariants(), "three wrong notes"), 49);
    expect(d.pitch.counts.mistake).toBe(0);
    expect(d.pitch.counts.uncertain).toBeGreaterThanOrEqual(3);
  });
  it("findings list mistakes before style before not sure", () => {
    const d = run(byName(mistakeVariants(), "three wrong notes"));
    const order = d.pitch.findings.map((f) => ({ mistake: 0, style: 1, uncertain: 2 })[f.category]);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("dynamics", () => {
  const idResult = resultFor({ name: "same", notes: lesson(), warp: (t) => t });
  it("never produces a mistake, even for very different shaping", () => {
    for (const [depth, phase] of [[10, 0], [3, Math.PI], [0.5, 0]] as const) {
      const card = dynamicsFeedback(features(3), features(depth, phase), idResult);
      expect(card.counts.mistake).toBe(0);
      for (const f of card.findings) expect(f.category).toBe("style");
    }
  });
  it("tells a player who shapes more widely so, and never to add more contrast", () => {
    const card = dynamicsFeedback(features(3), features(10), idResult);
    expect(card.sentence).toContain("more widely than the reference");
    expect(card.sentence).not.toContain("more intentional");
  });
  it("suggests bigger contrasts only to a player who is flatter, and only as a suggestion", () => {
    const card = dynamicsFeedback(features(10), features(1), idResult);
    expect(card.sentence).toContain("flatter than the reference");
    expect(card.sentence).toContain("if you want to match it");
  });
  it("keeps the score formula unchanged: matching shaping still scores 100", () => {
    expect(dynamicsFeedback(features(3), features(3), idResult).score).toBe(100);
  });
});

describe("tempo scores are unchanged", () => {
  it("a steady slower take keeps the same score as before (steadiness 100 minus the overall-pace penalty)", () => {
    const v = byName(styleVariants(), "steady 15% slower");
    const card = tempoFeedback(resultFor(v));
    expect(card.steadiness).toBe(100);
    expect(card.score).toBe(Math.round(100 - Math.abs(Math.log(1 / 1.15)) * 60));
  });
});

describe("saving and reopening", () => {
  it("a new result is version 3, survives saving as JSON, and keeps its categories", () => {
    const d = run(byName(mistakeVariants(), "three wrong notes"));
    expect(d.version).toBe(3);
    const reopened = readStoredComparison(JSON.parse(JSON.stringify(d)));
    expect(reopened.version).toBe(3);
    if (reopened.version !== 3) throw new Error("expected version 3");
    expect(reopened.pitch.findings.every((f) => ["mistake", "style", "uncertain"].includes(f.category) && f.reason.length > 0)).toBe(true);
    expect(reopened.pitch.counts.mistake).toBe(d.pitch.counts.mistake);
  });
  it("a version 2 result still opens, without categories or anything invented", () => {
    const v2 = { version: 2, similarity: 90, tempoRatio: 1, timingDeviationMs: 0, baselineActiveSeconds: 10, performanceActiveSeconds: 10, warnings: [], segments: alignment((t) => t).slice(0, 5), confidence: 70, confidenceReasons: [], coaching: ["Old advice"],
      pitch: { score: 80, sentence: "Old", findings: [{ baselineTime: 1, performanceTime: 1, text: "An extra G4 was detected." }] }, tempo: { score: 90, sentence: "Old", findings: [], steadiness: 95 }, dynamics: { score: 85, sentence: "Old", findings: [] } };
    const reopened = readStoredComparison(JSON.parse(JSON.stringify(v2)));
    expect(reopened.version).toBe(2);
    if (reopened.version !== 2) throw new Error("expected version 2");
    expect("category" in reopened.pitch.findings[0]!).toBe(false);
    expect("noMistakes" in reopened).toBe(false);
  });
  it("rejects formats it does not know", () => {
    expect(() => readStoredComparison({ version: 4, similarity: 1, segments: [] })).toThrow();
    expect(() => readStoredComparison({ version: 3, segments: [] })).toThrow();
  });
  it("keeps at most the stored cap of findings per category, while the counts still reflect all of them", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ kind: "missed" as const, baselineTime: i, performanceTime: i, expected: 60 }));
    const base = resultFor(byName(styleVariants(), "melody a little ahead"));
    const d = detailedFeedback({ ...base, noteFeedback: { matched: 0, wrong: 0, missed: 100, extra: 0, octaveErrors: 0, total: 100, accuracy: 0, findings: many } }, features(), features());
    expect(d.pitch.counts.uncertain).toBe(100); // no note lists were given, so none can be judged
    expect(d.pitch.findings.length).toBe(MAX_STORED_PER_CATEGORY);
  });
});
