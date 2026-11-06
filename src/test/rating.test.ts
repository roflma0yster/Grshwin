import { describe, expect, it } from "vitest";
import { DAILY_MOVE_CAP, INITIAL_DEVIATION, MAX_STEP, MIN_DEVIATION, SELF_REPORT_HEADROOM, applyEvidence, confidenceLabel, expectedScore, growDeviation, initialState, levelToRating, outcomeFromScore, ratingToLevel, updateRating, type Evidence } from "@/lib/rating";

const scored = (key: string, targetDifficulty: number, outcome: number): Evidence => ({ key, kind: "scored_exercise", targetDifficulty, outcome });
const selfReport = (key: string, targetDifficulty: number): Evidence => ({ key, kind: "self_report", targetDifficulty, outcome: 1 });

describe("level mapping", () => {
  it("maps ratings to the level labels and back", () => {
    expect(ratingToLevel(300)).toBe("Beginner");
    expect(ratingToLevel(900)).toBe("Early Intermediate");
    expect(ratingToLevel(1300)).toBe("Intermediate");
    expect(ratingToLevel(1700)).toBe("Upper Intermediate");
    expect(ratingToLevel(2300)).toBe("Advanced");
    for (const label of ["Early Intermediate", "Intermediate", "Upper Intermediate"]) expect(ratingToLevel(levelToRating(label))).toBe(label);
  });
  it("falls back to Early Intermediate for unknown labels", () => {
    expect(levelToRating(null)).toBe(900);
    expect(levelToRating("nonsense")).toBe(900);
  });
});

describe("expectedScore", () => {
  it("is 0.5 against equal difficulty and rises with rating", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 5);
    expect(expectedScore(1400, 1000)).toBeGreaterThan(0.9);
    expect(expectedScore(600, 1000)).toBeLessThan(0.1);
  });
});

describe("updateRating", () => {
  it("raises the rating after beating hard material and lowers it after failing easy material", () => {
    const s = initialState("Intermediate");
    expect(updateRating(s, scored("a", 1500, 1)).delta).toBeGreaterThan(0);
    expect(updateRating(s, scored("b", 1000, 0)).delta).toBeLessThan(0);
  });
  it("barely moves for an expected result", () => {
    const s = initialState("Intermediate");
    expect(Math.abs(updateRating(s, scored("a", 1300, 0.5)).delta)).toBeLessThanOrEqual(2);
  });
  it("shrinks the deviation with evidence but never below the floor", () => {
    let s = initialState("Intermediate");
    for (let i = 0; i < 200; i++) s = updateRating(s, scored(`k${i}`, s.rating, 0.5)).state;
    expect(s.deviation).toBeLessThan(INITIAL_DEVIATION);
    expect(s.deviation).toBeGreaterThanOrEqual(MIN_DEVIATION);
  });
  it("grows the deviation with inactivity, capped at the initial value", () => {
    expect(growDeviation(100, 0)).toBeCloseTo(100, 5);
    expect(growDeviation(100, 30)).toBeGreaterThan(100);
    expect(growDeviation(300, 5000)).toBe(INITIAL_DEVIATION);
  });
  it("caps the move from a single piece of evidence", () => {
    const s = { ...initialState("Early Intermediate"), deviation: INITIAL_DEVIATION };
    expect(Math.abs(updateRating(s, scored("a", 2400, 1)).delta)).toBeLessThanOrEqual(MAX_STEP.scored);
    expect(Math.abs(updateRating(s, selfReport("b", 2400)).delta)).toBeLessThanOrEqual(MAX_STEP.self_report);
  });
  it("caps total movement in one day", () => {
    let s = initialState("Early Intermediate");
    for (let i = 0; i < 20; i++) s = updateRating(s, scored(`k${i}`, 2400, 1)).state;
    expect(s.movedToday).toBeLessThanOrEqual(DAILY_MOVE_CAP);
    expect(Math.abs(s.rating - 900)).toBeLessThanOrEqual(DAILY_MOVE_CAP);
  });
  it("keeps the rating on the scale", () => {
    const low = { ...initialState("Beginner"), rating: 5, movedToday: 0 };
    expect(updateRating(low, scored("a", 0, 0)).state.rating).toBeGreaterThanOrEqual(0);
  });
});

describe("self-reported songs", () => {
  it("count for less than a scored exercise", () => {
    const s = initialState("Early Intermediate");
    expect(updateRating(s, selfReport("a", 1500)).delta).toBeLessThan(updateRating(s, scored("b", 1500, 1)).delta);
  });
  it("cannot push the rating beyond the headroom above the onboarding level", () => {
    let s = initialState("Early Intermediate");
    for (let i = 0; i < 50; i++) s = updateRating(s, { ...selfReport(`s${i}`, 2200), weight: 1 }).state;
    expect(s.rating).toBeLessThanOrEqual(s.baseline + SELF_REPORT_HEADROOM);
  });
  it("can go higher once scored evidence supports it", () => {
    let s = initialState("Early Intermediate");
    for (let i = 0; i < 6; i++) s = updateRating(s, scored(`e${i}`, 1500, 1)).state;
    const verified = s.scoredCeiling!;
    expect(verified).toBeGreaterThan(s.baseline);
    s = { ...s, movedToday: 0 };
    for (let i = 0; i < 50; i++) s = updateRating(s, { ...selfReport(`s${i}`, 2200), weight: 1 }).state, (s = { ...s, movedToday: 0 });
    expect(s.rating).toBeLessThanOrEqual(verified + SELF_REPORT_HEADROOM);
  });
  it("never lowers the rating", () => {
    const s = initialState("Intermediate");
    expect(updateRating(s, selfReport("a", 400)).delta).toBeGreaterThanOrEqual(0);
  });
});

describe("idempotent evidence", () => {
  it("counts the same key only once", () => {
    const s = initialState("Intermediate");
    const ev = scored("run-1:ladder-3", 1500, 1);
    const first = applyEvidence(s, new Set(), ev);
    expect(first.applied).toBe(true);
    const again = applyEvidence(first.state, new Set([ev.key]), ev);
    expect(again.applied).toBe(false);
    expect(again.state).toEqual(first.state);
    expect(again.delta).toBe(0);
  });
});

describe("outcomeFromScore and confidence", () => {
  it("turns accuracy and timing into an outcome in [0, 1]", () => {
    expect(outcomeFromScore({ accuracy: 100, timingMs: 0, beatMs: 1000 })).toBe(1);
    expect(outcomeFromScore({ accuracy: 100, timingMs: 1000, beatMs: 1000 })).toBeCloseTo(0.8, 5);
    expect(outcomeFromScore({ accuracy: 0, timingMs: null, beatMs: 1000 })).toBe(0);
    expect(outcomeFromScore({ accuracy: 50, timingMs: 5000, beatMs: 1000 })).toBeCloseTo(0.3, 5);
  });
  it("labels confidence by deviation", () => {
    expect(confidenceLabel(350)).toBe("still calibrating");
    expect(confidenceLabel(200)).toBe("getting clearer");
    expect(confidenceLabel(80)).toBe("fairly confident");
  });
});
