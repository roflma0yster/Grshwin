import { describe, it, expect } from "vitest";
import { tempoFeedback, dynamicsFeedback, detailedFeedback, readStoredComparison } from "@/lib/comparison-feedback";
import type { ComparisonResult, AudioFeatures } from "@/lib/audio-comparison";
const result: ComparisonResult = { version: 1, similarity: 100, tempoRatio: 1, timingDeviationMs: 0, baselineActiveSeconds: 12, performanceActiveSeconds: 12, warnings: [], segments: Array.from({ length: 13 }, (_, i) => ({ baselineTime: i, performanceTime: i, similarity: 100 })) };
const features = (volume = 1, flat = false): AudioFeatures => ({ start: 0, end: 12, tonalFraction: 1, frames: Array.from({ length: 120 }, (_, i) => ({ time: i / 10, rms: volume * (flat ? 0.3 : 0.03 * 10 ** (i / 100)), chroma: [] })) });
describe("recording coaching", () => {
  it("gives steady aligned tempo full credit", () => { expect(tempoFeedback(result)).toMatchObject({ score: 100, steadiness: 100, findings: [] }); });
  it("detects tempo drift and slowing sections", () => { const drift = { ...result, segments: result.segments.map((p) => ({ ...p, performanceTime: p.baselineTime <= 6 ? p.baselineTime : 6 + (p.baselineTime - 6) * 1.5 })) }; expect(tempoFeedback(drift).steadiness).toBeLessThan(90); expect(tempoFeedback(drift).findings.some((f) => f.text.includes("slowed down"))).toBe(true); });
  it("detects overall rushing", () => { expect(tempoFeedback({ ...result, tempoRatio: 1.3, segments: result.segments.map((p) => ({ ...p, performanceTime: p.performanceTime / 1.3 })) }).findings[0]?.text).toContain("sped up"); });
  it("normalizes recording gain for dynamics", () => { expect(dynamicsFeedback(features(), features(4), result).score).toBe(100); });
  it("detects flattened dynamics", () => { const card = dynamicsFeedback(features(), features(1, true), result); expect(card.score).toBeLessThan(80); expect(card.findings.some((f) => f.text.includes("stays more level"))).toBe(true); });
  it("reopens version 1 without invented details", () => { const old = readStoredComparison(JSON.parse(JSON.stringify(result))); expect(old.version).toBe(1); expect("pitch" in old).toBe(false); });
  it("creates version 2 and lowers confidence for disagreement", () => { const detailed = detailedFeedback({ ...result, noteFeedback: { accuracy: 20, total: 5, matched: 1, missed: 4, wrong: 0, extra: 0, octaveErrors: 0, findings: [] } }, features(), features()); expect(detailed.version).toBe(2); expect(detailed.confidence).toBe(40); expect(detailed.confidenceReasons.join(" ")).toContain("disagree"); expect(detailed.coaching.length).toBeLessThanOrEqual(3); });
});