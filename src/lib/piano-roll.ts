// Pure geometry for the falling-notes ("note highway") view. No React, no browser APIs:
// everything here is unit-tested and the canvas component only draws what these functions return.

import type { PlayNote } from "@/lib/music";

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" / "Bb3" / "E5" → MIDI number. Returns null for anything unrecognised. */
export function pitchToMidi(pitch: string): number | null {
  const match = /^([A-G])(#*|b*)(-?\d+)$/.exec(pitch);
  if (!match) return null;
  const step = match[1] ?? "";
  const accidentals = match[2] ?? "";
  const octaveText = match[3] ?? "4";
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

/** Move to the nearest white key in a direction: the keyboard always starts and ends on a white key. */
export function snapToWhite(midi: number, direction: -1 | 1): number {
  let m = midi;
  while (isBlackMidi(m)) m += direction;
  return m;
}

/** The range the piece actually uses, padded by two keys either side, at least two octaves, edges on white keys. */
export function fitRange(notes: PlayNote[]): { low: number; high: number } {
  const midis = notes.map((note) => pitchToMidi(note.pitch)).filter((midi): midi is number => midi !== null);
  if (!midis.length) return { low: 48, high: 71 }; // C3–B4
  let low = Math.min(...midis) - 2;
  let high = Math.max(...midis) + 2;
  while (high - low < 23) {
    if (low > 21) low--;
    if (high - low < 23) high++;
  }
  return { low: snapToWhite(Math.max(21, low), -1), high: snapToWhite(Math.min(108, high), 1) };
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

/** Gems ease in over the top 12% of the roll (y is 0 at the strike line, 1 at the top edge). */
export const FADE_IN = 0.12;
export function gemAlpha(y: number): number {
  return Math.max(0, Math.min(1, (1 - y) / FADE_IN));
}

export const TAIL_MIN_BEATS = 0.5; // notes shorter than an eighth note have no tail
export const TAIL_SCALE = 0.7;
export const TAIL_MAX_BEATS = 1.8;

/** Indicative, not to scale: square-root growth, capped, so duration stays secondary to the gem. */
export function tailBeats(duration: number): number {
  if (duration < TAIL_MIN_BEATS) return 0;
  return Math.min(TAIL_MAX_BEATS, TAIL_SCALE * Math.sqrt(duration));
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
 * Notes are assumed sorted by start. A note stays on screen while it sounds, so look back
 * as far as the longest note in the piece (pass it in; the default is a conservative two bars).
 */
export function windowStart<T extends { start: number }>(notes: readonly T[], position: number, maxDuration = 8): number {
  const earliest = position - Math.max(maxDuration, TAIL_MAX_BEATS);
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

// ---- precomputed note list for drawing -------------------------------------------------------

/** A note ready to draw: pitch already converted, sorted by onset. */
export type RollNote = { midi: number; start: number; duration: number; staff: number; fingering?: number };

export function toRollNotes(notes: readonly PlayNote[]): RollNote[] {
  const out: RollNote[] = [];
  for (const n of notes) {
    const midi = pitchToMidi(n.pitch);
    if (midi === null || !Number.isFinite(n.start) || !(n.duration > 0)) continue;
    out.push(n.fingering === undefined ? { midi, start: n.start, duration: n.duration, staff: n.staff } : { midi, start: n.start, duration: n.duration, staff: n.staff, fingering: n.fingering });
  }
  return out.sort((a, b) => a.start - b.start);
}

export function longestDuration(notes: readonly RollNote[]): number {
  let longest = 0;
  for (const n of notes) if (n.duration > longest) longest = n.duration;
  return longest;
}

/** Same-hand notes that start together, precomputed once per score for the chord connectors. */
export function groupRollChords(notes: readonly RollNote[]): ChordGroup[] {
  const groups = new Map<string, ChordGroup>();
  for (const n of notes) {
    const key = `${n.staff}:${n.start.toFixed(3)}`;
    const group = groups.get(key);
    if (group) group.midis.push(n.midi);
    else groups.set(key, { key, beat: n.start, staff: n.staff, midis: [n.midi] });
  }
  return [...groups.values()].filter((g) => g.midis.length > 1).sort((a, b) => a.beat - b.beat);
}

// ---- the practice range (shared with the playback engine's bar maths) -------------------------

/** Bars and beats the engine plays: the loop range, or the whole piece. Starts are in beats from the piece start. */
export function practiceRange(measureStarts: readonly number[], loop: boolean, from: number, to: number) {
  const bars = Math.max(0, measureStarts.length - 1);
  const startBar = loop ? from - 1 : 0;
  const endBar = loop ? to : bars;
  const t0 = measureStarts[startBar] ?? 0;
  const t1 = measureStarts[endBar] ?? 0;
  return { startBar, endBar, t0, t1, span: Math.max(0, t1 - t0) };
}

/** Notes rebased so beat 0 is the start of the practice range, ready for the roll. */
export function notesInRange(notes: readonly RollNote[], t0: number, t1: number): RollNote[] {
  const out: RollNote[] = [];
  for (const n of notes) {
    if (n.start >= t1 || n.start + n.duration <= t0) continue;
    const start = Math.max(t0, n.start);
    out.push({ ...n, start: start - t0, duration: Math.min(t1, n.start + n.duration) - start });
  }
  return out;
}

// ---- which keys are down, and the keyboard window for narrow screens -------------------------

/** MIDI note -> hand (staff) for notes sounding at `position`. A note counts as sounding for at least `minBeats`. */
export function soundingKeys(notes: readonly RollNote[], position: number, maxDuration: number, minBeats = 0.3): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = windowStart(notes, position, maxDuration); i < notes.length; i++) {
    const n = notes[i]!;
    if (n.start > position) break;
    if (position < n.start + Math.max(n.duration, minBeats)) out.set(n.midi, n.staff);
  }
  return out;
}

export const MIN_LANE_PX = 26;

/** How many white keys fit across `widthPx` without lanes getting narrower than MIN_LANE_PX. */
export function laneCapacity(widthPx: number, minLane = MIN_LANE_PX): number {
  return Math.max(8, Math.floor(widthPx / minLane));
}

/** Centre of a key in white-key units, or null if the key is outside the keyboard. */
export function keyCentre(keys: readonly KeyInfo[], midi: number): number | null {
  const key = keys.find((k) => k.midi === midi);
  return key ? key.x + key.width / 2 : null;
}

/**
 * Where a narrow-screen keyboard window starts (in white-key units, fractional so it can scroll smoothly).
 * If everything fits, the window starts at 0 and shows the whole keyboard.
 */
export function windowStartFor(totalWhite: number, capacity: number, focusWhite: number | null): number {
  if (capacity >= totalWhite) return 0;
  const centre = focusWhite ?? totalWhite / 2;
  return Math.max(0, Math.min(totalWhite - capacity, centre - capacity / 2));
}

/** The pitches of notes just played or arriving within `horizon` beats, optionally for some hands only. */
export function focusSpan(notes: readonly RollNote[], position: number, horizon: number, maxDuration: number, staffs?: ReadonlySet<number>): { low: number; high: number } | null {
  let low = Infinity, high = -Infinity;
  for (let i = windowStart(notes, position, maxDuration); i < notes.length; i++) {
    const n = notes[i]!;
    if (n.start > position + horizon) break;
    if (n.start < position - 0.25) continue; // notes still ringing from earlier do not steer the view
    if (staffs && !staffs.has(n.staff)) continue;
    if (n.midi < low) low = n.midi;
    if (n.midi > high) high = n.midi;
  }
  return high < low ? null : { low, high };
}

/**
 * Where the narrow-screen keyboard window should be centred, in white-key units (null = no preference).
 * It follows `yourStaffs` when given. If the notes it must show are wider than the window, it looks
 * at fewer upcoming beats; if they still do not fit, it follows the right hand, then the earliest note.
 */
export function focusCentre(keys: readonly KeyInfo[], notes: readonly RollNote[], position: number, lookAhead: number, maxDuration: number, capacity: number, yourStaffs?: ReadonlySet<number> | null): number | null {
  const centreOf = (span: { low: number; high: number }) => {
    const lo = keyCentre(keys, span.low), hi = keyCentre(keys, span.high);
    return lo === null || hi === null ? null : { centre: (lo + hi) / 2, width: hi - lo + 1 };
  };
  const tryStaffs = (staffs: ReadonlySet<number> | undefined) => {
    for (let horizon = lookAhead * 0.5; horizon >= 0.5; horizon /= 2) {
      const span = focusSpan(notes, position, horizon, maxDuration, staffs);
      const fit = span && centreOf(span);
      if (fit && fit.width <= capacity) return fit.centre;
    }
    return undefined;
  };
  const own = yourStaffs ?? undefined;
  const fitted = tryStaffs(own) ?? (own && own.size > 1 ? tryStaffs(new Set([1])) : undefined) ?? (own ? undefined : tryStaffs(new Set([1])));
  if (fitted !== undefined) return fitted;
  const nearest = focusSpan(notes, position, 0.5, maxDuration, own ?? new Set([1])) ?? focusSpan(notes, position, lookAhead, maxDuration);
  const c = nearest && keyCentre(keys, nearest.low);
  return c ?? null;
}

/** Exponential approach, so a scrolling keyboard window glides instead of jumping. Frame-rate independent. */
export function approach(current: number, target: number, dtSeconds: number, rate = 6): number {
  if (!(dtSeconds > 0)) return current;
  return current + (target - current) * (1 - Math.exp(-rate * dtSeconds));
}
