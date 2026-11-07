import type { AudioFeatures, ComparisonResult } from "@/lib/audio-comparison";
import { alignmentMap, type NoteComparison } from "@/lib/note-comparison";
export type Finding = { baselineTime: number; performanceTime: number; text: string; end?: number };
export type FeedbackCard = { score: number; sentence: string; findings: Finding[] };
export type DetailedComparison = Omit<ComparisonResult, "version"> & { version: 2; pitch: FeedbackCard; tempo: FeedbackCard & { steadiness: number }; dynamics: FeedbackCard; coaching: string[]; confidence: number; confidenceReasons: string[] };
export type StoredComparison = ComparisonResult | DetailedComparison;
const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const noteName = (midi: number) => `${["C", "D-flat", "D", "E-flat", "E", "F", "G-flat", "G", "A-flat", "A", "B-flat", "B"][((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
export function tempoFeedback(result: ComparisonResult): FeedbackCard & { steadiness: number } {
  const map = alignmentMap(result.segments), first = result.segments[0], last = result.segments.at(-1);
  const windows: { time: number; ratio: number; end: number }[] = [];
  if (first && last) for (let time = first.baselineTime; time + 2 <= last.baselineTime; time += 3) {
    const end = Math.min(time + 4, last.baselineTime), delta = map(end) - map(time);
    if (delta > 0.05) windows.push({ time, end, ratio: (end - time) / delta });
  }
  const relative = windows.map((w) => w.ratio / result.tempoRatio);
  const variation = Math.sqrt(mean(relative.map((r) => (r - mean(relative)) ** 2)));
  const steadiness = clamp(100 - variation * 150);
  const findings = windows.filter((w) => Math.abs(w.ratio - 1) > 0.1).sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1)).slice(0, 5).map((w) => ({ baselineTime: w.time, performanceTime: map(w.time), end: w.end, text: `You ${w.ratio < 1 ? "slowed down" : "sped up"} about ${Math.round(Math.abs(w.ratio - 1) * 100)}% compared with the reference in this section.` }));
  const score = clamp(steadiness - Math.abs(Math.log(Math.max(0.01, result.tempoRatio))) * 60);
  return { score, steadiness, findings, sentence: score >= 85 ? "Your pace is close to the reference; keep that steady pulse." : steadiness < 75 ? "Practise the changing-pace sections slowly, keeping a steady pulse." : `Your overall pace is ${result.tempoRatio < 1 ? "slower" : "faster"} than the reference; settle into its pulse.` };
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
  const rangeDifference = Math.abs(range(a.map((f) => f.db)) - range(b.map((f) => f.db)));
  const findings: Finding[] = [];
  for (let i = 0; i < a.length; i++) {
    const first = a[i]; if (!first) continue;
    const window = a.filter((f) => f.time >= first.time && f.time < first.time + 4);
    if (window.length < 3) continue;
    const gap = mean(window.map((f) => f.db - sample(map(f.time))));
    const last = window.at(-1); if (!last) continue;
    const build = last.db - first.db, playedBuild = sample(map(last.time)) - sample(map(first.time));
    if (Math.abs(build) > 4 && Math.abs(playedBuild) < 2) findings.push({ baselineTime: first.time, performanceTime: map(first.time), end: last.time, text: `The reference ${build > 0 ? "builds from soft to loud" : "fades from loud to soft"}; your loudness stays more level here.` });
    else if (Math.abs(gap) > 3) findings.push({ baselineTime: first.time, performanceTime: map(first.time), end: last.time, text: `After overall loudness is balanced, this section is relatively ${gap > 0 ? "softer" : "louder"} than the reference.` });
    i += Math.max(1, window.length - 1);
  }
  const score = clamp(100 - mismatch * 7 - rangeDifference * 3);
  return { score, findings: findings.slice(0, 5), sentence: score >= 85 ? "Your soft-to-loud shaping follows the reference well." : "Shape the highlighted phrases with more intentional soft and loud contrasts." };
}
export function detailedFeedback(result: ComparisonResult, baseline: AudioFeatures, performance: AudioFeatures): DetailedComparison {
  const notes: NoteComparison | undefined = result.noteFeedback;
  const pitch: FeedbackCard = notes ? { score: notes.accuracy, sentence: notes.accuracy >= 85 ? "Your notes closely follow the reference; keep the voicing clear." : "Practise the highlighted notes and chords slowly before adding speed.", findings: notes.findings.slice(0, 5).map((f) => ({ baselineTime: f.baselineTime, performanceTime: f.performanceTime, text: f.kind === "missed" ? `The reference has ${noteName(f.expected ?? 60)}; no matching note was detected.` : f.kind === "extra" ? `An extra ${noteName(f.played ?? 60)} was detected.` : f.kind === "octave" ? `${noteName(f.played ?? 60)} was detected an octave apart from the reference's ${noteName(f.expected ?? 60)}.` : `${noteName(f.played ?? 60)} was detected where the reference has ${noteName(f.expected ?? 60)}.` })) } : { score: result.similarity, sentence: "Pitch patterns are compared acoustically; note-level feedback is unavailable.", findings: result.segments.filter((s) => s.similarity < 65).filter((_, i) => i % 8 === 0).slice(0, 5).map((s) => ({ ...s, text: "The pitch pattern differs from the reference here; exact notes could not be checked." })) };
  const tempo = tempoFeedback(result), dynamics = dynamicsFeedback(baseline, performance, result);
  const confidenceReasons: string[] = ["Note estimates can confuse piano harmonics, pedal sustain and chord voices; scores are not verified note accuracy."];
  let confidence = notes ? result.confidence ?? 75 : 30;
  if (!notes) confidenceReasons.push(result.noteUnavailable ?? "Note-level analysis unavailable.");
  if (notes && Math.abs(result.similarity - notes.accuracy) > 30) { confidence = Math.min(confidence, 40); confidenceReasons.push("Acoustic similarity and note matches disagree: possible octave/voicing differences or transcription errors."); }
  if (result.similarity < 60) { confidence = Math.min(confidence, 35); confidenceReasons.push("The passages may differ, making alignment unreliable."); }
  const ranked = [{ score: pitch.score, advice: "Start with the highlighted notes and chords, using a slow, small loop." }, { score: tempo.score, advice: "Next, practise the changing-pace passages with a steady pulse." }, { score: dynamics.score, advice: "Then shape each phrase's soft-to-loud movement to match the reference." }].sort((a, b) => a.score - b.score);
  const priorities = ranked.filter((r) => r.score < 85);
  return { ...result, version: 2, pitch, tempo, dynamics, confidence, confidenceReasons, coaching: priorities.length ? priorities.slice(0, 3).map((r) => r.advice) : ["A strong match—keep this comfortable pace and bring the same control to the next passage."] };
}
/** Version 1 stays readable without inventing missing detailed feedback. */
export function readStoredComparison(value: unknown): StoredComparison {
  if (!value || typeof value !== "object" || !("version" in value) || (value.version !== 1 && value.version !== 2)) throw new Error("This saved comparison format is not supported.");
  if (!("similarity" in value) || !("segments" in value) || !Array.isArray(value.segments)) throw new Error("This saved comparison is incomplete.");
  return value as StoredComparison;
}