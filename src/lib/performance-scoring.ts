import type { PerformanceHit } from "@/lib/learning";

/** A note transcribed from audio. `start` is seconds after the FIRST count-in click. */
export type DetectedNote = { midi: number; start: number; duration: number; amplitude: number };

export type PerformanceResult = { hits: (PerformanceHit | null)[]; extraNotes: number };

/**
 * Constant delay (ms) between a note being played and the transcribed onset
 * (microphone, audio output and model frame rounding). Subtracted from every onset.
 * Starts at 0 and should be tuned after trying real pianos.
 */
export const LATENCY_CORRECTION_MS = 0;

/** The exercise plays this many count-in beats before the first melody note. */
export const COUNT_IN_BEATS = 4;

export type ScoreOptions = { countInBeats?: number; latencyMs?: number };

/**
 * Scores transcribed notes against the fixed melody, one slot per beat.
 * - A note is assigned to the slot nearest its onset (within half a beat).
 * - Only one note counts per slot (the closest onset, preferring the right pitch on a tie);
 *   other notes in the slot, and notes after the last slot window, are "extra".
 * - Notes before the count-in ends are ignored: they are usually the app's own clicks.
 * - Slots with no note stay null (missed), exactly like the classic method.
 */
export function scorePerformance(melody: readonly number[], tempo: number, notes: readonly DetectedNote[], options: ScoreOptions = {}): PerformanceResult {
  const beat = 60000 / tempo;
  const countIn = options.countInBeats ?? COUNT_IN_BEATS;
  const latency = options.latencyMs ?? LATENCY_CORRECTION_MS;
  const hits: (PerformanceHit | null)[] = melody.map(() => null);
  const best: ({ error: number; correct: boolean } | null)[] = melody.map(() => null);
  let extraNotes = 0;

  for (const note of notes) {
    const elapsed = note.start * 1000 - latency - countIn * beat; // ms since slot 0
    if (elapsed < -beat / 2) continue; // count-in noise
    const index = Math.round(elapsed / beat);
    if (index >= melody.length) { extraNotes++; continue; }
    const error = elapsed - index * beat;
    const correct = note.midi === melody[index];
    const current = best[index];
    const better = !current || Math.abs(error) < Math.abs(current.error) || (Math.abs(error) === Math.abs(current.error) && correct && !current.correct);
    if (current) extraNotes++; // one of the two notes in this slot is extra
    if (better) { best[index] = { error, correct }; hits[index] = { correct, offset: Math.round(error) }; }
  }
  return { hits, extraNotes };
}
