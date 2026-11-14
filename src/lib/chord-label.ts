// Turns the parts of a MusicXML <harmony> element into the symbol players expect ("Cmaj7", "F7", "E♭m7").

const KIND_SUFFIX: Record<string, string> = {
  major: "", minor: "m", augmented: "aug", diminished: "dim", dominant: "7",
  "major-seventh": "maj7", "minor-seventh": "m7", "diminished-seventh": "dim7", "augmented-seventh": "aug7",
  "half-diminished": "m7♭5", "major-minor": "m(maj7)", "major-sixth": "6", "minor-sixth": "m6",
  "dominant-ninth": "9", "major-ninth": "maj9", "minor-ninth": "m9",
  "dominant-11th": "11", "major-11th": "maj11", "minor-11th": "m11",
  "dominant-13th": "13", "major-13th": "maj13", "minor-13th": "m13",
  "suspended-second": "sus2", "suspended-fourth": "sus4", power: "5", none: "",
};

export function accidental(alter: number): string {
  if (!Number.isFinite(alter) || alter === 0) return "";
  const n = Math.min(2, Math.abs(Math.round(alter)));
  return (alter > 0 ? "♯" : "♭").repeat(n);
}

export type HarmonyParts = { rootStep: string; rootAlter?: number; kind?: string; kindText?: string; bassStep?: string; bassAlter?: number };

/**
 * Prefer the score's own display text for the chord type (writers usually set it to "maj7", "m7", ...);
 * otherwise translate the MusicXML kind name. Unknown kinds show nothing rather than raw XML words.
 */
export function chordLabel(h: HarmonyParts): string {
  if (!/^[A-G]$/.test(h.rootStep)) return "";
  const text = h.kindText?.trim();
  const suffix = text ? text : (KIND_SUFFIX[(h.kind ?? "").trim()] ?? "");
  const bass = h.bassStep && /^[A-G]$/.test(h.bassStep) ? `/${h.bassStep}${accidental(h.bassAlter ?? 0)}` : "";
  return `${h.rootStep}${accidental(h.rootAlter ?? 0)}${suffix}${bass}`;
}

/** Removes repeats (the same chord listed by several parts) and sorts by beat. */
export function tidyChords<T extends { beat: number; label: string }>(chords: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of [...chords].sort((a, b) => a.beat - b.beat)) {
    const key = `${c.beat.toFixed(3)}|${c.label}`;
    if (!c.label || seen.has(key)) continue;
    seen.add(key); out.push(c);
  }
  return out;
}
