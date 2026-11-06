// Skill levels: 0 none, 1 introduced, 2 working (counts as "you have this skill"), 3 secure.
export const SKILL_HAVE_LEVEL = 2;
export const SKILL_MAX_LEVEL = 3;

export type SkillSource = "self_report" | "practice_session";
/** The highest level each kind of evidence can reach on its own. */
export const SKILL_CAPS: Record<SkillSource, number> = { self_report: 1, practice_session: 2 };

export const SKILL_CATEGORIES = ["technique", "rhythm", "theory", "reading", "style", "expression"] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/** One step up per piece of evidence, never past the cap for its source, never down. */
export function nextSkillLevel(current: number, source: SkillSource) {
  return Math.max(current, Math.min(SKILL_CAPS[source], current + 1));
}

export function hasSkill(level: number | undefined) {
  return (level ?? 0) >= SKILL_HAVE_LEVEL;
}
