import { describe, expect, it } from "vitest";
import { DEFAULT_SCORING_METHOD, SCORING_METHODS, isScoringMethodId, scoringMethodLabel } from "@/lib/scoring-methods";

describe("scoring method registry", () => {
  it("has unique ids and labels, and a known input kind", () => {
    expect(new Set(SCORING_METHODS.map((m) => m.id)).size).toBe(SCORING_METHODS.length);
    expect(new Set(SCORING_METHODS.map((m) => m.label)).size).toBe(SCORING_METHODS.length);
    for (const m of SCORING_METHODS) expect(["midi-or-screen", "microphone"]).toContain(m.input);
  });
  it("defaults to classic", () => {
    expect(DEFAULT_SCORING_METHOD).toBe("classic");
    expect(isScoringMethodId(DEFAULT_SCORING_METHOD)).toBe(true);
  });
  it("rejects unknown ids", () => {
    expect(isScoringMethodId("nope")).toBe(false);
    expect(isScoringMethodId(null)).toBe(false);
  });
  it("labels saved rows without a method as classic", () => {
    expect(scoringMethodLabel(null)).toBe("Classic");
    expect(scoringMethodLabel("basic-pitch")).toBe("Basic Pitch (microphone)");
  });
});
