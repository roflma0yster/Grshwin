/** Registry of scoring methods. Add an entry here to offer a new method on the scoring page. */
export const SCORING_METHODS = [
  { id: "classic", label: "Classic", description: "Play on a MIDI keyboard or the on-screen piano.", input: "midi-or-screen" },
  { id: "basic-pitch", label: "Basic Pitch (microphone)", description: "Play your own piano. Spotify's Basic Pitch listens through the microphone.", input: "microphone" },
] as const;

export type ScoringMethod = (typeof SCORING_METHODS)[number];
export type ScoringMethodId = ScoringMethod["id"];
export type ScoringInput = ScoringMethod["input"];

export const DEFAULT_SCORING_METHOD: ScoringMethodId = "classic";
export const SCORING_METHOD_STORAGE_KEY = "grshwin.scoringMethod";

export function isScoringMethodId(value: unknown): value is ScoringMethodId {
  return SCORING_METHODS.some((m) => m.id === value);
}

/** Saved rows from before methods existed have no value and were scored classically. */
export function scoringMethodLabel(id: string | null | undefined) {
  return (SCORING_METHODS.find((m) => m.id === id) ?? SCORING_METHODS[0]).label;
}
