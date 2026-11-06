import { describe, expect, it } from "vitest";
import { SKILL_CAPS, hasSkill, nextSkillLevel } from "@/lib/skills";

describe("skill levels", () => {
  it("steps up one level at a time", () => {
    expect(nextSkillLevel(0, "practice_session")).toBe(1);
    expect(nextSkillLevel(1, "practice_session")).toBe(2);
  });
  it("stops at the cap for each source", () => {
    expect(nextSkillLevel(1, "self_report")).toBe(SKILL_CAPS.self_report);
    expect(nextSkillLevel(2, "practice_session")).toBe(SKILL_CAPS.practice_session);
  });
  it("never lowers a level", () => {
    expect(nextSkillLevel(3, "self_report")).toBe(3);
    expect(nextSkillLevel(3, "practice_session")).toBe(3);
  });
  it("counts level 2 and above as having the skill", () => {
    expect(hasSkill(undefined)).toBe(false);
    expect(hasSkill(1)).toBe(false);
    expect(hasSkill(2)).toBe(true);
  });
});
