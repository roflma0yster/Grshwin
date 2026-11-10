// Pure geometry for the falling-notes ("note highway") view. No React, no browser APIs:
// everything here is unit-tested and the canvas component only draws what these functions return.

import type { PlayNote } from "@/lib/music";

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" / "Bb3" / "E5" → MIDI number. Returns null for anything unrecognised. */
export function pitchToMidi(pitch: string): number | null {
  const match = /^([A-G])(#*|b*)(-?\d+)$/.exec(pitch);
  if (!match) return null;
  const [, step, accidentals, octaveText] = match;
  const base = SEMITONES[step];
  if (base === undefined) return null;
  let alter = 0;
  for (const character of accidentals) alter += character === "#" ? 1 : -1;
  return base + alter + (Number(octaveText) + 1) * 12;
}

export function isBlackMidi(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

export type KeyInfo = { midi: number; black: boolean; x: number; width: number };

/**
 * Key layout for a MIDI range, in "white key units": white keys are 1 unit wide,
 * black keys 0.6 units and centred on the boundary between their white neighbours.
 */
export function buildKeyboard(low: number, high: number): KeyInfo[] {
  const keys: KeyInfo[] = [];
  let white = 0;
  for (let midi = low; midi <= high; midi++) {
    if (isBlackMidi(midi)) keys.push({ midi, black: true, x: white - 0.3, width: 0.6 });
    else { keys.push({ midi, black: false, x: white, width: 1 }); white++; }
  }
  return keys;
}

export function keyboardWhiteKeys(keys: KeyInfo[]): number {
  return keys.reduce((count, key) => count + (key.black ? 0 : 1), 0);
}

/** The range the piece actually uses, padded by two keys either side, at least two octaves. */
export function fitRange(notes: PlayNote[]): { low: number; high: number } {
  const midis = notes.map((note) => pitchToMidi(note.pitch)).filter((midi): midi is number => midi !== null);
  if (!midis.length) return { low: 48, high: 71 }; // C3–B4
  let low = Math.min(...midis) - 2;
  let high = Math.max(...midis) + 2;
  while (high - low < 23) {
    if (low > 21) low--;
    if (high - low < 23) high++;
  }
  return { low: Math.max(21, low), high: Math.min(108, high) };
}

/** y position of a note's onset: 0 = strike line (bottom of the roll), 1 = top of the roll. */
export function beatToY(noteBeat: number, position: number, lookAhead: number): number {
  if (lookAhead <= 0) return 0;
  return (noteBeat - position) / lookAhead;
}

/** Gems scale from this fraction at the top of the roll to full size at the strike line. */
export const GEM_SCALE_TOP = 0.75;

export function gemScale(y: number): number {
  return GEM_SCALE_TOP + (1 - GEM_SCALE_TOP) * Math.max(0, Math.min(1, 1 - y));
}

/** Fade in over the top stretch of the roll. */
export function gemAlpha(y: number): number {
  return Math.max(0, Math.min(1, (1.15 - y) / 0.15));
}

export const TAIL_MIN_BEATS = 0.5; // notes shorter than an eighth note have no tail
export const TAIL_MAX_BEATS = 3;

/** Indicative, not to scale: square-root growth, capped so long notes never dominate. */
export function tailBeats(duration: number): number {
  if (duration < TAIL_MIN_BEATS) return 0;
  return Math.min(TAIL_MAX_BEATS, Math.sqrt(duration));
}

export type ChordGroup = { key: string; beat: number; staff: number; midis: number[] };

/** Notes that start together in the same hand read as one event. */
export function groupChords(notes: PlayNote[]): ChordGroup[] {
  const groups = new Map<string, ChordGroup>();
  for (const note of notes) {
    const key = `${note.staff}:${note.start.toFixed(3)}`;
    const midi = pitchToMidi(note.pitch);
    if (midi === null) continue;
    const group = groups.get(key);
    if (group) group.midis.push(midi);
    else groups.set(key, { key, beat: note.start, staff: note.staff, midis: [midi] });
  }
  return [...groups.values()].filter((group) => group.midis.length > 1);
}

/**
 * Index of the first note that could still be visible, via binary search on onset time.
 * Notes are assumed sorted by start. A tail can reach back at most TAIL_MAX_BEATS.
 */
export function windowStart(notes: PlayNote[], position: number): number {
  const earliest = position - TAIL_MAX_BEATS;
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((notes[mid]?.start ?? 0) < earliest) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Wrap a position into [0, span) for looping; negative (count-in) positions stay negative. */
export function wrapLoop(position: number, span: number, loop: boolean): number {
  if (!loop || span <= 0 || position < 0) return position;
  return position % span;
}
