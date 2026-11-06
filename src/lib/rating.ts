// Player level rating: a Glicko-style skill rating (not a true Elo, which needs head-to-head results).
// Pure functions only, so the same logic can run on the server and in tests.

export const RATING_MIN = 0;
export const RATING_MAX = 2400;
export const INITIAL_DEVIATION = 350;
/** Never claim to know the level more precisely than this. */
export const MIN_DEVIATION = 60;
/** Uncertainty grows with inactivity: deviation' = sqrt(dev^2 + c^2 * days), capped at INITIAL_DEVIATION. */
export const INACTIVITY_GROWTH = 12;
/** Largest rating move from a single piece of evidence. */
export const MAX_STEP = { scored: 150, self_report: 60 } as const;
/** Largest total rating movement (sum of absolute moves) in one day. */
export const DAILY_MOVE_CAP = 300;
/** Self-reported songs carry a quarter of the information of a scored exercise. */
export const SELF_REPORT_WEIGHT = 0.25;
/** Self-report alone can lift the rating at most this far above the best scored (or onboarding) level. */
export const SELF_REPORT_HEADROOM = 150;

export const LEVEL_BANDS = [
  { label: "Beginner", min: 0, mid: 500 },
  { label: "Early Intermediate", min: 700, mid: 900 },
  { label: "Intermediate", min: 1100, mid: 1300 },
  { label: "Upper Intermediate", min: 1500, mid: 1700 },
  { label: "Advanced", min: 1900, mid: 2100 },
] as const;
export type LevelLabel = (typeof LEVEL_BANDS)[number]["label"];

export function ratingToLevel(rating: number): LevelLabel {
  let label: LevelLabel = LEVEL_BANDS[0].label;
  for (const band of LEVEL_BANDS) if (rating >= band.min) label = band.label;
  return label;
}

/** Midpoint rating of a level label; unknown or missing labels fall back to Early Intermediate. */
export function levelToRating(label: string | null | undefined): number {
  return (LEVEL_BANDS.find((b) => b.label === label) ?? LEVEL_BANDS[1]).mid;
}

export type EvidenceKind = "self_report" | "scored_exercise" | "scored_sample";

export type RatingState = {
  rating: number;
  deviation: number;
  /** Sum of absolute rating moves already made today. */
  movedToday: number;
  /** Rating the player started from (their onboarding level). */
  baseline: number;
  /** Highest rating reached through scored evidence, if any. */
  scoredCeiling: number | null;
};

export type Evidence = {
  /** Stable key: the same key never counts twice. */
  key: string;
  kind: EvidenceKind;
  /** Difficulty of the piece or exercise on the rating scale. */
  targetDifficulty: number;
  /** 0 (failed) to 1 (flawless). */
  outcome: number;
  /** Overrides the default weight for the kind. */
  weight?: number;
};

const Q = Math.LN10 / 400;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function initialState(proficiency: string | null | undefined): RatingState {
  const baseline = levelToRating(proficiency);
  return { rating: baseline, deviation: INITIAL_DEVIATION, movedToday: 0, baseline, scoredCeiling: null };
}

/** Probability-style expected result of a player at `rating` against material of `difficulty`. */
export function expectedScore(rating: number, difficulty: number) {
  return 1 / (1 + Math.pow(10, (difficulty - rating) / 400));
}

/** Converts a scored exercise into an outcome in [0, 1]; sloppy timing costs up to 0.2. */
export function outcomeFromScore({ accuracy, timingMs, beatMs }: { accuracy: number; timingMs: number | null; beatMs: number }) {
  const timingPenalty = timingMs === null ? 0 : 0.2 * clamp(timingMs / beatMs, 0, 1);
  return clamp(accuracy / 100 - timingPenalty, 0, 1);
}

export function growDeviation(deviation: number, daysSinceUpdate: number) {
  const days = Math.max(0, daysSinceUpdate);
  return Math.min(INITIAL_DEVIATION, Math.sqrt(deviation * deviation + INACTIVITY_GROWTH * INACTIVITY_GROWTH * days));
}

export function updateRating(state: RatingState, evidence: Evidence, options: { daysSinceUpdate?: number } = {}): { state: RatingState; delta: number } {
  const deviation = growDeviation(state.deviation, options.daysSinceUpdate ?? 0);
  const selfReport = evidence.kind === "self_report";
  const weight = clamp(evidence.weight ?? (selfReport ? SELF_REPORT_WEIGHT : 1), 0.05, 1);
  const e = clamp(expectedScore(state.rating, evidence.targetDifficulty), 0.01, 0.99);
  const information = Q * Q * weight * e * (1 - e); // 1 / d^2, scaled by evidence weight
  const precision = 1 / (deviation * deviation) + information;
  const rawDelta = (Q / precision) * (clamp(evidence.outcome, 0, 1) - e);
  const newDeviation = Math.max(MIN_DEVIATION, Math.sqrt(1 / precision));

  let delta = clamp(rawDelta, -MAX_STEP[selfReport ? "self_report" : "scored"], MAX_STEP[selfReport ? "self_report" : "scored"]);
  delta = clamp(delta, -Math.max(0, DAILY_MOVE_CAP - state.movedToday), Math.max(0, DAILY_MOVE_CAP - state.movedToday));
  if (selfReport && delta > 0) {
    // Claims alone cannot outrun the evidence: stop at the headroom above the best verified level.
    const ceiling = Math.max(state.baseline, state.scoredCeiling ?? state.baseline) + SELF_REPORT_HEADROOM;
    delta = clamp(Math.min(delta, ceiling - state.rating), 0, delta);
  }
  const rating = clamp(Math.round(state.rating + delta), RATING_MIN, RATING_MAX);
  const applied = rating - Math.round(state.rating);
  return {
    delta: applied,
    state: {
      rating,
      deviation: newDeviation,
      movedToday: state.movedToday + Math.abs(applied),
      baseline: state.baseline,
      scoredCeiling: selfReport ? state.scoredCeiling : Math.max(state.scoredCeiling ?? RATING_MIN, rating),
    },
  };
}

/** Applies evidence once: a key already in `applied` leaves the state untouched. */
export function applyEvidence(state: RatingState, applied: ReadonlySet<string>, evidence: Evidence, options: { daysSinceUpdate?: number } = {}) {
  if (applied.has(evidence.key)) return { state, delta: 0, applied: false as const };
  return { ...updateRating(state, evidence, options), applied: true as const };
}

export function confidenceLabel(deviation: number) {
  if (deviation > 250) return "still calibrating";
  if (deviation > 150) return "getting clearer";
  return "fairly confident";
}

/** "about 1450 (still calibrating)" */
export function describeRating(rating: number, deviation: number) {
  return `about ${Math.round(rating / 10) * 10} (${confidenceLabel(deviation)})`;
}
