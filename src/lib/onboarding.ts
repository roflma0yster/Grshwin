// What the onboarding questionnaire asks, what "Skip for now" fills in, and how answers become a profile row.
// Pure: no React, no network.

export const GENRES = ["Classical", "Jazz", "Blues", "Pop"] as const;
export const GOALS = ["Fun", "Exam prep", "Performance"] as const;
export const DAILY_MINUTES = [15, 30, 45, 60] as const;
export const INPUT_METHODS = ["Acoustic", "Digital"] as const;

/** Used for any question left unanswered when the player skips. They match the app's own starting points. */
export const ONBOARDING_DEFAULTS = {
  genre: "Classical",
  proficiency: "Early Intermediate",
  goal: "Fun",
  daily_minutes: 30,
  input_method: "Digital",
} as const;

export type Answers = Record<string, string>;

export type ProfileAnswers = {
  genre: string;
  proficiency: string;
  goal: string;
  daily_minutes: number;
  input_method: string;
};

const oneOf = (value: string | undefined, allowed: readonly string[], fallback: string) => (value !== undefined && allowed.includes(value) ? value : fallback);

/** Every question answered: what the player gave, and the defaults for the rest. Unrecognised answers count as unanswered. */
export function completeAnswers(answers: Answers): ProfileAnswers {
  const minutes = Number(answers["daily_minutes"]);
  const proficiency = answers["proficiency"]?.trim();
  return {
    genre: oneOf(answers["genre"], GENRES, ONBOARDING_DEFAULTS.genre),
    proficiency: proficiency ? proficiency : ONBOARDING_DEFAULTS.proficiency,
    goal: oneOf(answers["goal"], GOALS, ONBOARDING_DEFAULTS.goal),
    daily_minutes: (DAILY_MINUTES as readonly number[]).includes(minutes) ? minutes : ONBOARDING_DEFAULTS.daily_minutes,
    input_method: oneOf(answers["input_method"], INPUT_METHODS, ONBOARDING_DEFAULTS.input_method),
  };
}

/** The row saved for this player. `onboarded: true` is what stops the app sending them back to the questionnaire. */
export function profilePayload(userId: string, answers: Answers) {
  return { id: userId, ...completeAnswers(answers), onboarded: true };
}

type ProfileLike = { genre: string | null; proficiency: string | null; goal: string | null; daily_minutes: number | null; input_method: string | null } | null | undefined;

/** Existing profile values as questionnaire answers, so coming back (or skipping) never wipes what was set. */
export function answersFromProfile(profile: ProfileLike): Answers {
  const out: Answers = {};
  if (!profile) return out;
  if (profile.genre) out["genre"] = profile.genre;
  if (profile.proficiency) out["proficiency"] = profile.proficiency;
  if (profile.goal) out["goal"] = profile.goal;
  if (profile.daily_minutes !== null && profile.daily_minutes !== undefined) out["daily_minutes"] = String(profile.daily_minutes);
  if (profile.input_method) out["input_method"] = profile.input_method;
  return out;
}
