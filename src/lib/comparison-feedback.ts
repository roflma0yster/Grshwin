import type { AudioFeatures, ComparisonResult } from "@/lib/audio-comparison";
import {
  capPerCategory, categorizePitchFindings, categorizeTempoWindow, countCategories, orderFindings,
  type CategoryCounts, type FindingCategory,
} from "@/lib/finding-categories";
import { alignmentMap, type NoteComparison, type NoteFinding } from "@/lib/note-comparison";
import type { DetectedNote } from "@/lib/performance-scoring";

/** A difference between the recordings, with a category: a likely mistake, a stylistic choice, or not sure. */
export type Finding = { baselineTime: number; performanceTime: number; text: string; end?: number; category: FindingCategory; reason: string };
export type FeedbackCard = { score: number; sentence: string; findings: Finding[]; counts: CategoryCounts };
export type TempoCard = FeedbackCard & { steadiness: number; overall: string };
/** Saved results keep this many findings per category and card; `counts` still reflect all of them. */
export const MAX_STORED_PER_CATEGORY = 40;

/** Version 3: every finding carries a category and reason. */
export type DetailedComparison = Omit<ComparisonResult, "version"> & {
  version: 3;
  pitch: FeedbackCard; tempo: TempoCard; dynamics: FeedbackCard;
  coaching: string[];
  /** True when no card has a likely mistake; then `styleSuggestion` may offer one optional thing to work on. */
  noMistakes: boolean;
  styleSuggestion?: string;
  confidence: number; confidenceReasons: string[];
};

/** Version 2 results were saved before findings had categories. They open as a plain list, with nothing invented. */
type LegacyFinding = { baselineTime: number; performanceTime: number; text: string; end?: number };
type LegacyCard = { score: number; sentence: string; findings: LegacyFinding[] };
export type LegacyDetailedComparison = Omit<ComparisonResult, "version"> & {
  version: 2;
  pitch: LegacyCard; tempo: LegacyCard & { steadiness: number }; dynamics: LegacyCard;
  coaching: string[]; confidence: number; confidenceReasons: string[];
};
export type StoredComparison = ComparisonResult | LegacyDetailedComparison | DetailedComparison;

export type NoteLists = { reference: readonly DetectedNote[]; performance: readonly DetectedNote[] };

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const noteName = (midi: number) => `${["C", "D-flat", "D", "E-flat", "E", "F", "G-flat", "G", "A-flat", "A", "B-flat", "B"][((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const finish = (findings: Finding[], weight?: (f: Finding) => number) => ({ counts: countCategories(findings), findings: capPerCategory(orderFindings(findings, weight), MAX_STORED_PER_CATEGORY) });

export function tempoFeedback(result: ComparisonResult): TempoCard {
  const map = alignmentMap(result.segments), first = result.segments[0], last = result.segments.at(-1);
  const windows: { time: number; ratio: number; end: number }[] = [];
  if (first && last) for (let time = first.baselineTime; time + 2 <= last.baselineTime; time += 3) {
    const end = Math.min(time + 4, last.baselineTime), delta = map(end) - map(time);
    if (delta > 0.05) windows.push({ time, end, ratio: (end - time) / delta });
  }
  // each window is judged against the player's own overall pace, so playing steadily slower or faster is not an error
  const relative = windows.map((w) => w.ratio / result.tempoRatio);
  const variation = Math.sqrt(mean(relative.map((r) => (r - mean(relative)) ** 2)));
  const steadiness = clamp(100 - variation * 150);
  const all: Finding[] = [];
  const deviation = new Map<Finding, number>();
  windows.forEach((w, i) => {
    const rel = relative[i] ?? 1;
    const verdict = categorizeTempoWindow(rel, relative[i - 1], relative[i + 1]);
    if (!verdict) return;
    const percent = Math.round(Math.abs(rel - 1) * 100);
    const text = verdict.category === "mistake"
      ? `Your pace changes suddenly here (about ${percent}% ${rel < 1 ? "slower" : "faster"} than your overall pace).`
      : `Compared with your overall pace, you ${rel < 1 ? "slowed down" : "sped up"} about ${percent}% in this section.`;
    const finding: Finding = { baselineTime: w.time, performanceTime: map(w.time), end: w.end, text, category: verdict.category, reason: verdict.reason };
    deviation.set(finding, Math.abs(rel - 1)); all.push(finding);
  });
  const { findings, counts } = finish(all, (f) => deviation.get(f) ?? 0);
  const score = clamp(steadiness - Math.abs(Math.log(Math.max(0.01, result.tempoRatio))) * 60);
  const speed = Math.round(Math.abs(1 - result.tempoRatio) * 100);
  // the overall difference is information, not a finding
  const overall = speed < 3 ? "Your overall pace matches the reference." : `You played about ${speed}% ${result.tempoRatio < 1 ? "slower" : "faster"} overall.`;
  const sentence = counts.mistake > 0 ? "Practise the sudden pace changes slowly, keeping a steady pulse."
    : score >= 85 ? "Your pace is close to the reference; keep that steady pulse."
    : "No clear pacing mistakes; your pace differs from the reference mostly in overall speed or smooth shaping.";
  return { score, steadiness, findings, counts, overall, sentence };
}

export function dynamicsFeedback(baseline: AudioFeatures, performance: AudioFeatures, result: ComparisonResult): FeedbackCard {
  const map = alignmentMap(result.segments);
  const normal = (features: AudioFeatures) => {
    const logs = features.frames.map((f) => 20 * Math.log10(Math.max(0.00001, f.rms))), average = mean(logs);
    return features.frames.map((f, i) => ({ time: f.time, db: (logs[i] ?? average) - average }));
  };
  const a = normal(baseline), b = normal(performance);
  const sample = (time: number) => {
    if (!b.length) return 0;
    let nearest = b[0]; for (const f of b) if (!nearest || Math.abs(f.time - time) < Math.abs(nearest.time - time)) nearest = f;
    return nearest?.db ?? 0;
  };
  const range = (values: number[]) => { const sorted = [...values].sort((x, y) => x - y); return (sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 0) - (sorted[Math.floor((sorted.length - 1) * 0.1)] ?? 0); };
  const mismatch = mean(a.map((f) => Math.abs(f.db - sample(map(f.time)))));
  const referenceRange = range(a.map((f) => f.db)), playedRange = range(b.map((f) => f.db));
  const rangeDifference = Math.abs(referenceRange - playedRange);
  // Shaping dynamics differently is an interpretation, never a mistake.
  const style = (baselineTime: number, end: number, text: string): Finding => ({ baselineTime, performanceTime: map(baselineTime), end, text, category: "style", reason: "Different shaping from the reference" });
  const all: Finding[] = [];
  for (let i = 0; i < a.length; i++) {
    const first = a[i]; if (!first) continue;
    const window = a.filter((f) => f.time >= first.time && f.time < first.time + 4);
    if (window.length < 3) continue;
    const gap = mean(window.map((f) => f.db - sample(map(f.time))));
    const last = window.at(-1); if (!last) continue;
    const build = last.db - first.db, playedBuild = sample(map(last.time)) - sample(map(first.time));
    if (Math.abs(build) > 4 && Math.abs(playedBuild) < 2) all.push(style(first.time, last.time, `The reference ${build > 0 ? "builds from soft to loud" : "fades from loud to soft"} here; your loudness stays more level.`));
    else if (Math.abs(gap) > 3) all.push(style(first.time, last.time, `After overall loudness is balanced, this section is relatively ${gap > 0 ? "softer" : "louder"} than the reference.`));
    i += Math.max(1, window.length - 1);
  }
  const { findings, counts } = finish(all);
  const score = clamp(100 - mismatch * 7 - rangeDifference * 3);
  const sentence = score >= 85 ? "Your soft-to-loud shaping follows the reference well."
    : playedRange - referenceRange > 2 ? "You shape the dynamics more widely than the reference."
    : referenceRange - playedRange > 2 ? "Your dynamics are flatter than the reference; if you want to match it, try bigger soft-to-loud contrasts."
    : "Your loudness shape differs from the reference in places; see the differences below.";
  return { score, findings, counts, sentence };
}

const KIND_WEIGHT: Record<NoteFinding["kind"], number> = { wrong: 3, missed: 2, octave: 1, extra: 1 };
function pitchText(f: NoteFinding) {
  return f.kind === "missed" ? `The reference has ${noteName(f.expected ?? 60)}; no matching note was detected.`
    : f.kind === "extra" ? `An extra ${noteName(f.played ?? 60)} was detected.`
    : f.kind === "octave" ? `${noteName(f.played ?? 60)} was detected an octave apart from the reference's ${noteName(f.expected ?? 60)}.`
    : `${noteName(f.played ?? 60)} was detected where the reference has ${noteName(f.expected ?? 60)}.`;
}

function pitchCard(result: ComparisonResult, notes: NoteComparison | undefined, confidence: number, noteLists?: NoteLists): FeedbackCard {
  if (!notes) {
    // no note-level analysis: only an acoustic hint, and nothing can be called a mistake
    const all: Finding[] = result.segments.filter((s) => s.similarity < 65).filter((_, i) => i % 8 === 0).slice(0, 5)
      .map((s) => ({ baselineTime: s.baselineTime, performanceTime: s.performanceTime, text: "The pitch pattern differs from the reference here; exact notes could not be checked.", category: "uncertain" as const, reason: "Only an acoustic comparison was possible, so this cannot be judged" }));
    return { score: result.similarity, sentence: "Pitch patterns are compared acoustically; note-level feedback is unavailable.", ...finish(all) };
  }
  const kinds = new Map<Finding, NoteFinding["kind"]>();
  const all: Finding[] = categorizePitchFindings(notes.findings, { reference: noteLists?.reference, performance: noteLists?.performance, alignment: result.segments, confidence }).map((c) => {
    const finding: Finding = { baselineTime: c.finding.baselineTime, performanceTime: c.finding.performanceTime, text: pitchText(c.finding), category: c.category, reason: c.reason };
    kinds.set(finding, c.finding.kind); return finding;
  });
  const { findings, counts } = finish(all, (f) => KIND_WEIGHT[kinds.get(f) ?? "extra"]);
  const sentence = counts.mistake > 0 ? "Practise the highlighted notes and chords slowly before adding speed."
    : notes.accuracy >= 85 ? "Your notes closely follow the reference; keep the voicing clear."
    : "No clear note mistakes; the differences are mostly stylistic.";
  return { score: notes.accuracy, sentence, findings, counts };
}

const CARD_LABEL = { pitch: "the notes", tempo: "the pacing", dynamics: "the dynamics" } as const;

export function detailedFeedback(result: ComparisonResult, baseline: AudioFeatures, performance: AudioFeatures, noteLists?: NoteLists): DetailedComparison {
  const notes: NoteComparison | undefined = result.noteFeedback;
  const confidenceReasons: string[] = ["Note estimates can confuse piano harmonics, pedal sustain and chord voices; scores are not verified note accuracy."];
  let confidence = notes ? result.confidence ?? 75 : 30;
  if (!notes) confidenceReasons.push(result.noteUnavailable ?? "Note-level analysis unavailable.");
  if (notes && Math.abs(result.similarity - notes.accuracy) > 30) { confidence = Math.min(confidence, 40); confidenceReasons.push("Acoustic similarity and note matches disagree: possible octave/voicing differences or transcription errors."); }
  if (result.similarity < 60) { confidence = Math.min(confidence, 35); confidenceReasons.push("The passages may differ, making alignment unreliable."); }
  const pitch = pitchCard(result, notes, confidence, noteLists), tempo = tempoFeedback(result), dynamics = dynamicsFeedback(baseline, performance, result);

  // Advice comes only from likely mistakes (dynamics never has any).
  const advice = [
    { card: pitch, text: "Start with the likely note mistakes, using a slow, small loop." },
    { card: tempo, text: "Next, practise the sudden pace changes slowly, keeping a steady pulse." },
  ].filter((a) => a.card.counts.mistake > 0).sort((x, y) => x.card.score - y.card.score).map((a) => a.text);
  // Only when there are none: one optional suggestion, from the card with the most stylistic differences.
  const styled = (["pitch", "tempo", "dynamics"] as const).map((kind) => ({ kind, card: { pitch, tempo, dynamics }[kind] })).filter((c) => c.card.counts.style > 0)
    .sort((x, y) => y.card.counts.style - x.card.counts.style || x.card.score - y.card.score)[0];
  const first = styled?.card.findings.find((f) => f.category === "style");
  const styleSuggestion = advice.length || !styled || !first ? undefined : `If you want to match the reference more closely, start with ${CARD_LABEL[styled.kind]}: ${first.text}`;
  return { ...result, version: 3, pitch, tempo, dynamics, confidence, confidenceReasons, coaching: advice, noMistakes: advice.length === 0, ...(styleSuggestion ? { styleSuggestion } : {}) };
}

/** Versions 1 and 2 stay readable without inventing details they never had. */
export function readStoredComparison(value: unknown): StoredComparison {
  if (!value || typeof value !== "object" || !("version" in value) || (value.version !== 1 && value.version !== 2 && value.version !== 3)) throw new Error("This saved comparison format is not supported.");
  if (!("similarity" in value) || !("segments" in value) || !Array.isArray(value.segments)) throw new Error("This saved comparison is incomplete.");
  return value as StoredComparison;
}
