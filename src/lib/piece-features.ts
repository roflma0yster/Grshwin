// Simple, deterministic features read from MusicXML. The text is expected to have passed
// validateScore() already; this only counts things, it does not validate or render.

export type PieceFeatures = {
  fifths: number | null; // key signature: sharps (+) or flats (-)
  beats: number | null;
  beatType: number | null;
  tempo: number | null;
  measures: number;
  notes: number;
  notesPerMeasure: number;
  lowest: number | null; // MIDI
  highest: number | null;
  accidentalRatio: number; // share of notes with a sharp or flat
  chordRatio: number; // share of notes sounding together with another
  rhythmicVariety: number; // distinct written note values
  widestChord: number; // semitones
};

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const first = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}[^>]*>\\s*([^<]*?)\\s*</${tag}>`))?.[1] ?? null;
const num = (v: string | null) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

function midiOf(note: string): number | null {
  const step = first(note, "step");
  const octave = num(first(note, "octave"));
  if (!step || octave === null || !(step in STEPS)) return null;
  return 12 * (octave + 1) + STEPS[step]! + (num(first(note, "alter")) ?? 0);
}

export function extractPieceFeatures(xml: string): PieceFeatures {
  const measures = (xml.match(/<measure[\s>]/g) ?? []).length;
  const noteBlocks = [...xml.matchAll(/<note[\s>][\s\S]*?<\/note>/g)].map((m) => m[0]).filter((n) => !/<rest[\s/>]/.test(n));
  const pitches: number[] = [];
  const types = new Set<string>();
  let accidentals = 0;
  let chordNotes = 0;
  let widestChord = 0;
  let group: number[] = [];
  const flush = () => { if (group.length > 1) widestChord = Math.max(widestChord, Math.max(...group) - Math.min(...group)); group = []; };
  for (const block of noteBlocks) {
    const midi = midiOf(block);
    if (midi === null) continue;
    pitches.push(midi);
    const type = first(block, "type"); if (type) types.add(type);
    const alter = num(first(block, "alter")); if (alter) accidentals++;
    if (/<chord\s*\/>/.test(block)) { chordNotes++; group.push(midi); }
    else { flush(); group = [midi]; }
  }
  flush();
  const count = pitches.length;
  const tempo = num(first(xml, "per-minute")) ?? num(xml.match(/<sound[^>]*\btempo="([\d.]+)"/)?.[1] ?? null);
  return {
    fifths: num(first(xml, "fifths")),
    beats: num(first(xml, "beats")),
    beatType: num(first(xml, "beat-type")),
    tempo,
    measures,
    notes: count,
    notesPerMeasure: measures ? Math.round((count / measures) * 10) / 10 : 0,
    lowest: count ? Math.min(...pitches) : null,
    highest: count ? Math.max(...pitches) : null,
    accidentalRatio: count ? accidentals / count : 0,
    chordRatio: count ? chordNotes / count : 0,
    rhythmicVariety: types.size,
    widestChord,
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Moves a label-based difficulty rating by at most +/-100 using how busy and chromatic the score is. */
export function difficultyNudge(f: PieceFeatures): number {
  if (f.notes === 0) return 0;
  const density = clamp((f.notesPerMeasure - 6) / 10, -1, 1); // about 6 notes a bar is average
  const chroma = clamp((f.accidentalRatio - 0.08) / 0.15, -1, 1);
  const key = clamp(((Math.abs(f.fifths ?? 0)) - 2) / 3, -1, 1);
  const rhythm = clamp((f.rhythmicVariety - 3) / 3, -1, 1);
  const span = clamp((f.widestChord - 9) / 5, -1, 1);
  return Math.round(clamp((density * 40 + chroma * 20 + key * 15 + rhythm * 15 + span * 10) , -100, 100));
}

export function refinedDifficulty(base: number, features: PieceFeatures | null) {
  return features ? base + difficultyNudge(features) : base;
}

/** 0 (nothing alike) to 1 (identical profile). Needs features for both pieces. */
export function featureSimilarity(a: PieceFeatures, b: PieceFeatures): number {
  const parts = [
    1 - clamp(Math.abs((a.fifths ?? 0) - (b.fifths ?? 0)) / 6, 0, 1),
    a.beats === b.beats && a.beatType === b.beatType ? 1 : 0,
    1 - clamp(Math.abs(a.notesPerMeasure - b.notesPerMeasure) / 12, 0, 1),
    1 - clamp(Math.abs(a.accidentalRatio - b.accidentalRatio) / 0.3, 0, 1),
    1 - clamp(Math.abs(a.rhythmicVariety - b.rhythmicVariety) / 5, 0, 1),
  ];
  return parts.reduce((s, x) => s + x, 0) / parts.length;
}
