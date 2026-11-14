// Settings and rules for the falling-notes view and Play along mode. Pure: no React, no storage, no audio.
import type { PlaybackHands } from "@/lib/music";

export type PlayAlongMode = "watch" | "along";
export type YourHand = "right" | "left" | "both";

export type PlayAlongSettings = {
  mode: PlayAlongMode;
  yourHand: YourHand;
  /** Bars of count-in click before the first pass in Play along (Watch never counts in). */
  countInBars: 0 | 1 | 2;
  /** Beats of music visible ahead of the strike line. Purely visual. */
  lookAhead: number;
  /** Shifts the picture against the sound to cover display and audio delay, in milliseconds. */
  syncMs: number;
  showRoll: boolean;
};

export const PLAY_ALONG_STORAGE_KEY = "grshwin.playAlong";
export const LOOK_AHEAD_RANGE = { min: 2, max: 8 } as const;
export const SYNC_RANGE = { min: -300, max: 300 } as const;

export const DEFAULT_PLAY_ALONG: PlayAlongSettings = { mode: "watch", yourHand: "right", countInBars: 1, lookAhead: 4, syncMs: 0, showRoll: true };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** Accepts anything (an old, edited or corrupt stored value) and returns safe settings. */
export function parsePlayAlongSettings(raw: unknown): PlayAlongSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_PLAY_ALONG;
  const count = Math.round(num(o.countInBars, d.countInBars));
  return {
    mode: o.mode === "along" || o.mode === "watch" ? o.mode : d.mode,
    yourHand: o.yourHand === "right" || o.yourHand === "left" || o.yourHand === "both" ? o.yourHand : d.yourHand,
    countInBars: count <= 0 ? 0 : count >= 2 ? 2 : 1,
    lookAhead: clamp(num(o.lookAhead, d.lookAhead), LOOK_AHEAD_RANGE.min, LOOK_AHEAD_RANGE.max),
    syncMs: Math.round(clamp(num(o.syncMs, d.syncMs), SYNC_RANGE.min, SYNC_RANGE.max)),
    showRoll: typeof o.showRoll === "boolean" ? o.showRoll : d.showRoll,
  };
}

export type PlayRole = {
  /** What the app plays aloud. "none" means only the click. */
  audible: PlaybackHands | "none";
  countInBars: number;
  /** Staffs (hands) the player plays, drawn bright. null = everything is bright. */
  yourStaffs: ReadonlySet<number> | null;
};

/**
 * Watch: the app plays what the existing Hands control selects, with no count-in, everything bright.
 * Play along: the app plays the hand(s) you are NOT playing, and counts you in.
 */
export function playRole(settings: PlayAlongSettings, watchHands: PlaybackHands): PlayRole {
  if (settings.mode === "watch") return { audible: watchHands, countInBars: 0, yourStaffs: null };
  const audible = settings.yourHand === "right" ? "left" : settings.yourHand === "left" ? "right" : "none";
  const yourStaffs = new Set(settings.yourHand === "both" ? [1, 2] : [settings.yourHand === "right" ? 1 : 2]);
  return { audible, countInBars: settings.countInBars, yourStaffs };
}

/** Beats in one bar: the longest of the first few bars, so a short pickup bar does not shrink the count-in. */
export function typicalBarBeats(measureStarts: readonly number[]): number {
  let longest = 0;
  for (let i = 0; i + 1 < measureStarts.length && i < 4; i++) longest = Math.max(longest, (measureStarts[i + 1] ?? 0) - (measureStarts[i] ?? 0));
  return longest > 0 ? longest : 4;
}

export function countInBeats(measureStarts: readonly number[], bars: number): number {
  const whole = Math.max(0, Math.min(2, Math.floor(Number.isFinite(bars) ? bars : 0)));
  return whole * typicalBarBeats(measureStarts);
}

/** The number to show during the count-in: 4, 3, 2, 1 (null once the music has started). */
export function countInNumber(position: number): number | null {
  return position < 0 ? Math.ceil(-position) : null;
}

/** Visual sync offset converted to beats at a tempo (positive moves the picture later, like a longer display delay). */
export function syncBeats(syncMs: number, tempo: number): number {
  return (syncMs / 1000) * (tempo / 60);
}
