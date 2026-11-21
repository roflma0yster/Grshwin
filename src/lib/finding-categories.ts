// Decides whether a difference between a performance and a reference is a likely mistake, a stylistic
// choice, or something the app cannot be sure about. Pure functions with named thresholds: no React.
//
// The guiding rule: when in doubt, "uncertain" beats "mistake". A recording is not the truth, so a
// difference is only called a mistake when nothing in the rules explains it any other way.
import { alignmentMap, usableNotes, type AlignmentPoint, type NoteFinding } from "@/lib/note-comparison";
import type { DetectedNote } from "@/lib/performance-scoring";

export type FindingCategory = "mistake" | "style" | "uncertain";
export type Categorised = { category: FindingCategory; reason: string };

/** Comparison confidence (0-100) below this means "not sure" beats "mistake". */
export const LOW_CONFIDENCE = 50;
/** Seconds within which the same note at a nearby moment counts as the same note played differently. */
export const SAME_NOTE_WINDOW = 0.5;
/** Seconds within which a different note of the reference chord counts as a different voicing. */
export const VOICING_WINDOW = 0.3;
export const ORNAMENT_MAX_DURATION = 0.2;
export const ORNAMENT_FOLLOW_WINDOW = 0.25;
/** An extra note quieter than this is probably an echo or a detection artefact. */
export const QUIET_AMPLITUDE = 0.25;
/** A window's pace must differ from the overall pace by more than this to be a finding at all. */
export const TEMPO_DEVIATION = 0.1;
/** Change between neighbouring windows under this is a smooth change (rubato); over TEMPO_ABRUPT is a sudden one. */
export const TEMPO_SMOOTH = 0.15;
export const TEMPO_ABRUPT = 0.3;

/** Boundary comparisons allow for floating-point noise (1.1 - 1 is 0.10000000000000009), so "exactly at the limit" is inside it. */
const EPS = 1e-6;
const within = (a: number, b: number, window: number) => Math.abs(a - b) <= window + EPS;
const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;
const noteKey = (midi: number, start: number) => `${midi}@${start.toFixed(3)}`;

export type PitchContext = {
  /** The transcribed notes of both recordings. Without them only the octave rule can be decided. */
  reference?: readonly DetectedNote[];
  performance?: readonly DetectedNote[];
  alignment: readonly AlignmentPoint[];
  /** 0-100. */
  confidence: number;
};

export type CategorisedPitchFinding = Categorised & { finding: NoteFinding };

const DETAILS_UNAVAILABLE = "The notes behind this were not available, so it cannot be judged.";

export function categorizePitchFindings(findings: readonly NoteFinding[], ctx: PitchContext): CategorisedPitchFinding[] {
  const hasNotes = !!ctx.reference && !!ctx.performance;
  const reference = ctx.reference ? usableNotes(ctx.reference) : [];
  const performance = ctx.performance ? usableNotes(ctx.performance) : [];
  const map = alignmentMap(ctx.alignment);
  const lowConfidence = ctx.confidence < LOW_CONFIDENCE;
  // performed notes that were not matched to any reference note
  const unmatched = new Set<string>();
  for (const f of findings) if (f.kind === "extra" && f.played !== undefined) unmatched.add(noteKey(f.played, f.performanceTime));
  const performed = (f: NoteFinding) => performance.find((n) => n.midi === f.played && Math.abs(n.start - f.performanceTime) < 0.001);
  /** A reference note of this pitch class is on, or about to be on, at this performance time. */
  const referenceNear = (pc: number, time: number, window: number) =>
    reference.some((r) => pitchClass(r.midi) === pc && (within(map(r.start), time, window) || (map(r.start) <= time + EPS && time <= map(r.start + r.duration) + EPS)));

  return findings.map((finding): CategorisedPitchFinding => {
    const result = (category: FindingCategory, reason: string): CategorisedPitchFinding => ({ finding, category, reason });
    if (finding.kind === "octave") return result("style", "Same note in a different octave (register or doubling)");

    if (finding.kind === "extra") {
      if (!hasNotes || finding.played === undefined) return result("uncertain", DETAILS_UNAVAILABLE);
      const note = performed(finding);
      if (!note) return result("uncertain", DETAILS_UNAVAILABLE);
      if (referenceNear(pitchClass(note.midi), note.start, SAME_NOTE_WINDOW)) return result("style", "Looks like a doubling or added octave");
      if (note.duration < ORNAMENT_MAX_DURATION && performance.some((n) => n !== note && n.start > note.start && n.start <= note.start + ORNAMENT_FOLLOW_WINDOW + EPS)) return result("style", "Looks like an ornament or grace note");
      if (note.amplitude < QUIET_AMPLITUDE) return result("uncertain", "Quiet extra note, may be an echo or a detection artefact");
      return result("style", "A note that is not in the reference (added decoration or voicing)");
    }

    if (finding.kind === "missed") {
      if (!hasNotes || finding.expected === undefined) return result("uncertain", DETAILS_UNAVAILABLE);
      const near = performance.filter((n) => pitchClass(n.midi) === pitchClass(finding.expected ?? 0) && within(n.start, finding.performanceTime, SAME_NOTE_WINDOW));
      if (near.some((n) => unmatched.has(noteKey(n.midi, n.start)))) return result("style", "Same note at a different moment (rolled chord, rubato or timing)");
      // the same note is nearby but already counted against another note of the reference: the evidence cuts both ways
      if (near.length) return result("uncertain", "The same note is played nearby, but it is already matched to another note");
      if (lowConfidence) return result("uncertain", "No matching note was heard, but this comparison is low confidence");
      return result("mistake", "A note in the reference was not heard");
    }

    // wrong: a different semitone at the aligned moment
    if (!ctx.reference || finding.played === undefined) return result("uncertain", DETAILS_UNAVAILABLE);
    if (referenceNear(pitchClass(finding.played), finding.performanceTime, VOICING_WINDOW)) return result("style", "Different voicing of the same chord");
    if (lowConfidence) return result("uncertain", "A different note than the reference, but this comparison is low confidence");
    return result("mistake", "A different note than the reference");
  });
}

/**
 * Tempo: how one window's pace (already divided by the overall pace, so 1 means "your usual pace")
 * compares with its neighbours. Returns null when the window is within the normal range.
 */
export function categorizeTempoWindow(relative: number, previous?: number, next?: number): Categorised | null {
  if (Math.abs(relative - 1) <= TEMPO_DEVIATION + EPS) return null;
  const neighbours = [previous, next].filter((v): v is number => v !== undefined);
  if (!neighbours.length) return { category: "uncertain", reason: "The pace differs here, but there is too little around it to tell whether it was deliberate" };
  const change = Math.max(...neighbours.map((v) => Math.abs(relative - v)));
  if (change < TEMPO_SMOOTH - EPS) return { category: "style", reason: "Smooth tempo shaping (rubato)" };
  if (change > TEMPO_ABRUPT + EPS) return { category: "mistake", reason: "A sudden change in pace" };
  return { category: "uncertain", reason: "The pace changes here, but it is unclear whether that was deliberate" };
}

// ---- ordering and counting -------------------------------------------------------------------

const PRIORITY: Record<FindingCategory, number> = { mistake: 0, style: 1, uncertain: 2 };
export const CATEGORIES: readonly FindingCategory[] = ["mistake", "style", "uncertain"];
export type CategoryCounts = Record<FindingCategory, number>;

export function countCategories(items: readonly { category: FindingCategory }[]): CategoryCounts {
  const counts: CategoryCounts = { mistake: 0, style: 0, uncertain: 0 };
  for (const item of items) counts[item.category]++;
  return counts;
}

/** Mistakes first, then style, then not sure; within a group, by `weight` (larger first) and then by time. */
export function orderFindings<T extends { category: FindingCategory; baselineTime: number }>(items: readonly T[], weight: (item: T) => number = () => 0): T[] {
  return [...items].sort((a, b) => PRIORITY[a.category] - PRIORITY[b.category] || weight(b) - weight(a) || a.baselineTime - b.baselineTime);
}

/** Keeps at most `perCategory` findings of each kind (so saved results stay small); the counts still reflect all of them. */
export function capPerCategory<T extends { category: FindingCategory }>(items: readonly T[], perCategory: number): T[] {
  const seen: CategoryCounts = { mistake: 0, style: 0, uncertain: 0 };
  return items.filter((item) => ++seen[item.category] <= perCategory);
}
