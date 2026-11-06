import { describe, expect, it } from "vitest";
import { difficultyNudge, extractPieceFeatures, featureSimilarity, refinedDifficulty } from "@/lib/piece-features";

const note = (step: string, octave: number, type: string) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><type>${type}</type></note>`;
const sharp = (step: string, octave: number, type: string) => `<note><pitch><step>${step}</step><alter>1</alter><octave>${octave}</octave></pitch><duration>1</duration><type>${type}</type></note>`;
const chordNote = (step: string, octave: number) => `<note><chord/><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><type>quarter</type></note>`;
const rest = `<note><rest/><duration>1</duration><type>quarter</type></note>`;

const SIMPLE = `<score-partwise><part id="P1">
<measure number="1"><attributes><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes><direction><sound tempo="96"/></direction>
${note("C", 4, "quarter")}${note("E", 4, "quarter")}${rest}${note("G", 4, "quarter")}</measure>
<measure number="2">${note("C", 5, "half")}${sharp("F", 4, "quarter")}${note("D", 4, "quarter")}</measure>
</part></score-partwise>`;

describe("extractPieceFeatures", () => {
  const f = extractPieceFeatures(SIMPLE);
  it("reads key, meter and tempo", () => {
    expect(f.fifths).toBe(0);
    expect(f.beats).toBe(4);
    expect(f.beatType).toBe(4);
    expect(f.tempo).toBe(96);
  });
  it("counts measures and sounding notes (rests excluded)", () => {
    expect(f.measures).toBe(2);
    expect(f.notes).toBe(6);
    expect(f.notesPerMeasure).toBe(3);
  });
  it("finds the pitch range as MIDI numbers", () => {
    expect(f.lowest).toBe(60); // C4
    expect(f.highest).toBe(72); // C5
  });
  it("measures accidentals and rhythmic variety", () => {
    expect(f.accidentalRatio).toBeCloseTo(1 / 6, 5);
    expect(f.rhythmicVariety).toBe(2); // quarter, half
  });
  it("measures chords and their span", () => {
    const g = extractPieceFeatures(`<score-partwise><part><measure>${note("C", 4, "quarter")}${chordNote("E", 4)}${chordNote("G", 4)}</measure></part></score-partwise>`);
    expect(g.chordRatio).toBeCloseTo(2 / 3, 5);
    expect(g.widestChord).toBe(7);
  });
  it("copes with an empty score", () => {
    const e = extractPieceFeatures("<score-partwise></score-partwise>");
    expect(e.notes).toBe(0);
    expect(e.lowest).toBeNull();
    expect(difficultyNudge(e)).toBe(0);
  });
});

describe("difficulty and similarity", () => {
  it("nudges a busy, chromatic score up and a sparse one down, within +/-100", () => {
    const busy = { ...extractPieceFeatures(SIMPLE), notesPerMeasure: 20, accidentalRatio: 0.3, fifths: 5, rhythmicVariety: 6, widestChord: 14 };
    const sparse = { ...extractPieceFeatures(SIMPLE), notesPerMeasure: 2, accidentalRatio: 0, fifths: 0, rhythmicVariety: 1, widestChord: 0 };
    expect(difficultyNudge(busy)).toBeGreaterThan(0);
    expect(difficultyNudge(busy)).toBeLessThanOrEqual(100);
    expect(difficultyNudge(sparse)).toBeLessThan(0);
    expect(difficultyNudge(sparse)).toBeGreaterThanOrEqual(-100);
  });
  it("falls back to the label rating without features", () => {
    expect(refinedDifficulty(1300, null)).toBe(1300);
  });
  it("rates identical pieces as fully similar and very different ones lower", () => {
    const a = extractPieceFeatures(SIMPLE);
    expect(featureSimilarity(a, a)).toBeCloseTo(1, 5);
    expect(featureSimilarity(a, { ...a, fifths: 6, beats: 6, beatType: 8, notesPerMeasure: 30, accidentalRatio: 0.4, rhythmicVariety: 7 })).toBeLessThan(0.3);
  });
});
