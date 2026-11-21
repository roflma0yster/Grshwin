// A synthetic "lesson" and performances of it, for testing how differences are categorised.
// The lesson: 8 bars at 100 BPM (2.4 s a bar, 19.2 s in all). Each bar has four melody quarter notes,
// a held three-note chord on beat 1 and two bass notes.
import type { ComparisonResult, AudioFeatures } from "@/lib/audio-comparison";
import { compareNotes } from "@/lib/note-comparison";
import type { DetectedNote } from "@/lib/performance-scoring";

export const BEAT = 0.6;
export const BARS = 8;
export const DURATION = BARS * 4 * BEAT;

const n = (midi: number, start: number, duration: number, amplitude: number): DetectedNote => ({ midi, start, duration, amplitude });
const MELODY = 0.5, HELD = 1.2;

export function lesson(): DetectedNote[] {
  const out: DetectedNote[] = [];
  for (let b = 0; b < BARS; b++) {
    const t = b * 4 * BEAT;
    [72, 74, 76, 74].forEach((m, i) => out.push(n(m + (b % 2 ? 2 : 0) * (i % 2), t + i * BEAT, MELODY, 0.7)));
    [60, 64, 67].forEach((m) => out.push(n(m, t, HELD, 0.6)));
    out.push(n(48 + (b % 4), t, HELD, 0.6), n(55, t + 2 * BEAT, HELD, 0.6));
  }
  return out;
}

const isMelody = (x: DetectedNote) => x.duration === MELODY;
const isChord = (x: DetectedNote) => x.duration === HELD && x.midi >= 60 && x.midi <= 67;
const isBass = (x: DetectedNote) => x.duration === HELD && x.midi < 56;

export type Variant = { name: string; notes: DetectedNote[]; warp: (t: number) => number };
const same = (t: number) => t;
const variant = (name: string, notes: DetectedNote[], warp: (t: number) => number = same): Variant => ({ name, notes, warp });
const shift = (notes: DetectedNote[], f: (x: DetectedNote) => number) => notes.map((x) => ({ ...x, start: x.start + f(x) }));

/** Performances with NO mistakes: only the kind of choices a professional makes. */
export function styleVariants(): Variant[] {
  const L = lesson();
  const rubato = (t: number) => t + 0.18 * Math.sin((2 * Math.PI * t) / 6.4);
  return [
    variant("melody a little ahead", shift(L, (x) => (isMelody(x) ? -0.04 : 0))),
    variant("chords rolled wide", shift(L, (x) => (isChord(x) ? [0, 0.15, 0.3][[60, 64, 67].indexOf(x.midi)]! : 0))),
    variant("bass doubled an octave lower", [...L, ...L.filter(isBass).map((x) => ({ ...x, midi: x.midi - 12 }))]),
    variant("grace-note ornaments", [...L, ...L.filter(isMelody).filter((_, i) => i % 4 === 0).map((x) => n(x.midi + 2, x.start - 0.12, 0.1, 0.45))]),
    variant("different voicing", L.flatMap((x) => (isChord(x) && x.midi === 60 ? [{ ...x, midi: 72 }, { ...x, midi: 74 }] : [x]))),
    variant("steady 15% slower", shift(L, (x) => x.start * 0.15), (t) => t * 1.15),
    variant("smooth rubato", shift(L, (x) => rubato(x.start) - x.start), rubato),
  ];
}

/** Performances WITH real mistakes, so the rules cannot just turn everything into style. */
export function mistakeVariants(): Variant[] {
  const L = lesson();
  // Notes are picked by beat number (an integer), never by comparing floating-point times.
  const beatOf = (x: DetectedNote) => Math.round(x.start / BEAT);
  // beat 2 of bars 2, 4 and 6 (a note that does not share a pitch class with anything nearby)
  const wrongAt = new Set([1, 3, 5].map((b) => b * 4 + 1));
  // beat 4 of bars 1, 3 and 5
  const missingAt = new Set([0, 2, 4].map((b) => b * 4 + 3));
  const slowdown = (t: number) => (t < 9.6 ? t : 9.6 + (t - 9.6) * 2);
  return [
    variant("three wrong notes", L.map((x) => (isMelody(x) && wrongAt.has(beatOf(x)) ? { ...x, midi: x.midi + 1 } : x))),
    variant("three missing notes", L.filter((x) => !(isMelody(x) && missingAt.has(beatOf(x))))),
    variant("an abrupt slowdown", shift(L, (x) => slowdown(x.start) - x.start), slowdown),
  ];
}

/** What the app would hand over as its alignment: lesson time -> performance time, about every 0.19 s. */
export function alignment(warp: (t: number) => number) {
  const out = [];
  for (let t = 0; t <= DURATION; t += 0.186) out.push({ baselineTime: t, performanceTime: warp(t), similarity: 100 });
  return out;
}

/** The comparison result the app builds before it adds feedback, for a performance of the lesson. */
export function resultFor(v: Variant, confidence = 75): ComparisonResult {
  const segments = alignment(v.warp);
  const reference = lesson();
  const performanceDuration = v.warp(DURATION);
  return {
    version: 1, similarity: 100, tempoRatio: DURATION / performanceDuration, timingDeviationMs: 0,
    baselineActiveSeconds: DURATION, performanceActiveSeconds: performanceDuration, warnings: [], segments,
    noteFeedback: compareNotes(reference, v.notes, segments), confidence,
  };
}

/** Loudness frames: a gentle phrase shape of +/- `depth` dB, used for the dynamics card. */
export function features(depth = 3, phase = 0): AudioFeatures {
  return {
    start: 0, end: DURATION, tonalFraction: 1,
    frames: Array.from({ length: Math.floor(DURATION / 0.186) }, (_, i) => {
      const t = i * 0.186;
      return { time: t, chroma: [] as number[], rms: 0.05 * Math.pow(10, (depth * Math.sin((2 * Math.PI * t) / 9.6 + phase)) / 20) };
    }),
  };
}
