import { describe, expect, it } from "vitest";
import { computeStreak } from "@/lib/data";

const today = new Date("2026-10-21T12:00:00Z");
describe("streak", () => {
  it("counts consecutive days ending today", () => {
    expect(computeStreak(["2026-10-21", "2026-10-20", "2026-10-19"], today)).toBe(3);
  });
  it("still counts when today isn't practised yet", () => {
    expect(computeStreak(["2026-10-20", "2026-10-19"], today)).toBe(2);
  });
  it("breaks on a missed day", () => {
    expect(computeStreak(["2026-10-21", "2026-10-19"], today)).toBe(1);
  });
});
