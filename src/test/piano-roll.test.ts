import { describe, expect, it } from "vitest";
import {
  FADE_IN, MIN_LANE_PX, approach, focusCentre, TAIL_MAX_BEATS, beatToY, buildKeyboard, fitRange, focusSpan, gemAlpha, gemScale, groupChords, groupRollChords, isBlackMidi,
  keyboardWhiteKeys, keyCentre, laneCapacity, longestDuration, notesInRange, pitchToMidi, practiceRange, snapToWhite, soundingKeys, tailBeats,
  toRollNotes, windowStart, windowStartFor, wrapLoop, type RollNote,
} from "@/lib/piano-roll";

const pn = (pitch: string, start = 0, duration = 1, staff = 1) => ({ pitch, start, duration, staff, measure: 0 });
const rn = (midi: number, start: number, duration = 1, staff = 1): RollNote => ({ midi, start, duration, staff });

describe("pitch and keyboard layout", () => {
  it("converts pitch names to MIDI numbers", () => {
    expect(pitchToMidi("C4")).toBe(60);
    expect(pitchToMidi("A0")).toBe(21);
    expect(pitchToMidi("C#4")).toBe(61);
    expect(pitchToMidi("Bb3")).toBe(58);
    expect(pitchToMidi("C8")).toBe(108);
    expect(pitchToMidi("nonsense")).toBeNull();
  });
  it("lays out 88 keys with 52 white keys", () => {
    const keys = buildKeyboard(21, 108);
    expect(keys).toHaveLength(88);
    expect(keyboardWhiteKeys(keys)).toBe(52);
  });
  it("centres each black key on the boundary between its two white neighbours", () => {
    const keys = buildKeyboard(60, 71); // C4..B4
    const white = (m: number) => keys.find((k) => k.midi === m)!;
    const black = (m: number) => keys.find((k) => k.midi === m)!;
    const cSharp = black(61);
    expect(cSharp.black).toBe(true);
    expect(cSharp.x + cSharp.width / 2).toBeCloseTo(white(60).x + 1, 5); // the C/D boundary
    expect(cSharp.width).toBeCloseTo(0.6, 5);
  });
});

describe("fitRange", () => {
  it("pads the used range and keeps at least two octaves", () => {
    const r = fitRange([pn("C4"), pn("E4")]);
    expect(r.high - r.low).toBeGreaterThanOrEqual(23);
    expect(r.low).toBeLessThanOrEqual(58);
    expect(r.high).toBeGreaterThanOrEqual(66);
  });
  it("always starts and ends on a white key, so no black key hangs off an edge", () => {
    for (const [a, b] of [["C#4", "E5"], ["D4", "F#5"], ["Bb3", "C5"], ["F#2", "G#6"]] as const) {
      const r = fitRange([pn(a), pn(b)]);
      const keys = buildKeyboard(r.low, r.high);
      expect(keys[0]!.black).toBe(false);
      expect(keys.at(-1)!.black).toBe(false);
      expect(keys[0]!.x).toBe(0);
    }
  });
  it("stays inside the 88-key piano", () => {
    const r = fitRange([pn("A0"), pn("C8")]);
    expect(r.low).toBe(21);
    expect(r.high).toBe(108);
  });
  it("has a default range for an empty score", () => {
    expect(fitRange([])).toEqual({ low: 48, high: 71 });
  });
  it("snaps toward the requested side", () => {
    expect(snapToWhite(61, -1)).toBe(60);
    expect(snapToWhite(61, 1)).toBe(62);
    expect(snapToWhite(60, 1)).toBe(60);
    expect(isBlackMidi(61)).toBe(true);
  });
});

describe("falling geometry", () => {
  it("puts the strike line at 0 and the top of the roll at 1", () => {
    expect(beatToY(4, 4, 6)).toBe(0);
    expect(beatToY(10, 4, 6)).toBe(1);
    expect(beatToY(7, 4, 6)).toBeCloseTo(0.5, 5);
    expect(beatToY(7, 4, 0)).toBe(0);
  });
  it("grows gems from 75% at the top to full size at the strike line", () => {
    expect(gemScale(1)).toBeCloseTo(0.75, 5);
    expect(gemScale(0)).toBe(1);
    expect(gemScale(0.5)).toBeCloseTo(0.875, 5);
  });
  it("fades gems in inside the top stretch of the roll, not beyond it", () => {
    expect(gemAlpha(0.5)).toBe(1);
    expect(gemAlpha(1 - FADE_IN)).toBeCloseTo(1, 5);
    expect(gemAlpha(1 - FADE_IN / 2)).toBeCloseTo(0.5, 5);
    expect(gemAlpha(1)).toBe(0);
    expect(gemAlpha(1.2)).toBe(0);
  });
});

describe("tails", () => {
  it("gives no tail to notes shorter than an eighth", () => {
    expect(tailBeats(0.25)).toBe(0);
    expect(tailBeats(0.49)).toBe(0);
    expect(tailBeats(0.5)).toBeGreaterThan(0);
  });
  it("keeps the tail shorter than the note it describes, so duration stays secondary", () => {
    expect(tailBeats(1)).toBeLessThan(1);
    expect(tailBeats(2)).toBeLessThan(2);
    expect(tailBeats(4)).toBeLessThan(4);
  });
  it("grows sub-linearly and is capped", () => {
    expect(tailBeats(2)).toBeGreaterThan(tailBeats(1));
    expect(tailBeats(4) / tailBeats(1)).toBeLessThan(4);
    expect(tailBeats(100)).toBe(TAIL_MAX_BEATS);
  });
});

describe("chords", () => {
  it("groups same-hand notes that start together", () => {
    const groups = groupChords([pn("C4"), pn("E4"), pn("G4"), pn("C2", 0, 1, 2), pn("D4", 1)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.midis.sort()).toEqual([60, 64, 67]);
  });
  it("does not join the two hands into one chord", () => {
    expect(groupChords([pn("C4", 0, 1, 1), pn("C3", 0, 1, 2)])).toHaveLength(0);
  });
  it("precomputes chord groups sorted by beat", () => {
    const groups = groupRollChords([rn(64, 2), rn(60, 2), rn(60, 0), rn(67, 0), rn(72, 1)]);
    expect(groups.map((g) => g.beat)).toEqual([0, 2]);
  });
});

describe("windowing", () => {
  const notes = Array.from({ length: 100 }, (_, i) => rn(60, i));
  it("skips notes that have finished", () => {
    expect(windowStart(notes, 50.5, 1)).toBe(49);
    expect(windowStart(notes, 0)).toBe(0);
  });
  it("keeps a long held note that started well before the position", () => {
    const held = [rn(48, 0, 8), ...Array.from({ length: 20 }, (_, i) => rn(60, 1 + i))];
    // the whole note (8 beats) is still sounding at position 6
    expect(windowStart(held, 6, longestDuration(held))).toBe(0);
  });
  it("finds the longest duration", () => {
    expect(longestDuration([rn(60, 0, 1), rn(60, 1, 6), rn(60, 2, 2)])).toBe(6);
    expect(longestDuration([])).toBe(0);
  });
});

describe("the practice range", () => {
  const starts = [0, 4, 8, 12, 16];
  it("is the whole piece unless looping", () => {
    expect(practiceRange(starts, false, 2, 3)).toMatchObject({ startBar: 0, endBar: 4, t0: 0, t1: 16, span: 16 });
  });
  it("is the loop bars (1-based, inclusive) when looping", () => {
    expect(practiceRange(starts, true, 2, 3)).toMatchObject({ startBar: 1, endBar: 3, t0: 4, t1: 12, span: 8 });
  });
  it("rebases notes to the start of the range and clips them to its end", () => {
    // bar range is beats 4 to 12: the first note ends before it, the last starts after it
    const out = notesInRange([rn(60, 2, 1), rn(62, 5, 1), rn(64, 7, 4), rn(65, 13, 1)], 4, 12);
    expect(out).toEqual([rn(62, 1, 1), rn(64, 3, 4)]);
  });
  it("clips a note that runs past the end of the range", () => {
    expect(notesInRange([rn(64, 10, 4)], 4, 12)).toEqual([rn(64, 6, 2)]);
  });
  it("includes a note that began before the range but is still sounding in it", () => {
    const out = notesInRange([rn(48, 2, 4)], 4, 12);
    expect(out).toEqual([{ midi: 48, start: 0, duration: 2, staff: 1 }]);
  });
  it("wraps a looping position but leaves count-in positions negative", () => {
    expect(wrapLoop(9, 8, true)).toBe(1);
    expect(wrapLoop(9, 8, false)).toBe(9);
    expect(wrapLoop(-2, 8, true)).toBe(-2);
  });
});

describe("converting notes for drawing", () => {
  it("sorts by onset, drops unreadable pitches, and keeps fingering", () => {
    const out = toRollNotes([pn("E4", 2), { ...pn("C4", 0), fingering: 1 }, pn("??", 1)]);
    expect(out.map((n) => n.midi)).toEqual([60, 64]);
    expect(out[0]!.fingering).toBe(1);
    expect(out[1]!.fingering).toBeUndefined();
  });
});

describe("which keys are down", () => {
  it("lights notes that are sounding and no others", () => {
    const notes = [rn(60, 0, 1, 1), rn(48, 0, 4, 2), rn(64, 2, 1, 1)];
    expect([...soundingKeys(notes, 0.5, 4).entries()].sort()).toEqual([[48, 2], [60, 1]]);
    expect([...soundingKeys(notes, 1.5, 4).keys()].sort()).toEqual([48]);
  });
  it("keeps a very short note lit for a moment so the flash is visible", () => {
    expect(soundingKeys([rn(60, 0, 0.1)], 0.2, 1).has(60)).toBe(true);
    expect(soundingKeys([rn(60, 0, 0.1)], 0.5, 1).has(60)).toBe(false);
  });
  it("keeps a held note lit even when it began long ago", () => {
    expect(soundingKeys([rn(48, 0, 8), rn(60, 7, 1)], 6, 8).has(48)).toBe(true);
  });
});

describe("narrow screens", () => {
  it("never lets lanes get narrower than the minimum", () => {
    expect(laneCapacity(390)).toBe(Math.floor(390 / MIN_LANE_PX));
    expect(laneCapacity(1100)).toBe(Math.floor(1100 / MIN_LANE_PX));
    expect(laneCapacity(50)).toBe(8);
  });
  it("shows the whole keyboard when it fits", () => {
    expect(windowStartFor(25, 40, 12)).toBe(0);
  });
  it("centres a scrolling window on the notes, clamped to the keyboard", () => {
    expect(windowStartFor(52, 14, 26)).toBeCloseTo(19, 5);
    expect(windowStartFor(52, 14, 1)).toBe(0);
    expect(windowStartFor(52, 14, 51)).toBe(52 - 14);
    expect(windowStartFor(52, 14, null)).toBeCloseTo(19, 5);
  });
  it("finds a key's centre in white-key units", () => {
    const keys = buildKeyboard(60, 71);
    expect(keyCentre(keys, 60)).toBeCloseTo(0.5, 5);
    expect(keyCentre(keys, 61)).toBeCloseTo(1, 5);
    expect(keyCentre(keys, 20)).toBeNull();
  });
  it("focuses on notes just played or arriving soon, not ones still ringing", () => {
    const notes = [rn(40, 0, 8), rn(60, 3, 1), rn(72, 5, 1), rn(90, 20, 1)];
    expect(focusSpan(notes, 2, 4, 8)).toEqual({ low: 60, high: 72 }); // the held bass note does not steer the view
    expect(focusSpan([], 0, 6, 1)).toBeNull();
  });
  it("can follow only the hands you play", () => {
    const notes = [rn(40, 3, 1, 2), rn(64, 3, 1, 1)];
    expect(focusSpan(notes, 3, 2, 1, new Set([1]))).toEqual({ low: 64, high: 64 });
    expect(focusSpan(notes, 3, 2, 1, new Set([2]))).toEqual({ low: 40, high: 40 });
  });
});

describe("keeping the right notes in a narrow window", () => {
  const keys = buildKeyboard(36, 84); // C2..C6, 29 white keys
  const hands = [rn(36, 4, 2, 2), rn(60, 4, 1, 1), rn(64, 4, 1, 1), rn(67, 4, 1, 1), rn(71, 4, 1, 1)];
  it("centres on the span when it fits", () => {
    const c = focusCentre(keys, [rn(60, 4), rn(64, 4)], 4, 6, 1, 13)!;
    expect(c).toBeCloseTo(((keyCentre(keys, 60) ?? 0) + (keyCentre(keys, 64) ?? 0)) / 2, 5);
  });
  it("follows your hand when it is far from the other one", () => {
    const right = focusCentre(keys, hands, 4, 6, 2, 13, new Set([1]))!;
    const left = focusCentre(keys, hands, 4, 6, 2, 13, new Set([2]))!;
    expect(right).toBeGreaterThan(left + 10);
    expect(right).toBeCloseTo(((keyCentre(keys, 60) ?? 0) + (keyCentre(keys, 71) ?? 0)) / 2, 5);
  });
  it("in Watch mode, with two distant hands that cannot both fit, follows the right hand", () => {
    const c = focusCentre(keys, hands, 4, 6, 2, 13, null)!;
    expect(c).toBeCloseTo(((keyCentre(keys, 60) ?? 0) + (keyCentre(keys, 71) ?? 0)) / 2, 5);
  });
  it("looks at fewer upcoming beats when the notes it must show are too wide", () => {
    const notes = [rn(60, 4), rn(64, 5), rn(100, 9)]; // a far-away note later on
    const c = focusCentre(buildKeyboard(48, 108), notes, 4, 12, 1, 13)!;
    expect(c).toBeLessThan(keyCentre(buildKeyboard(48, 108), 84)!);
  });
  it("has no preference when nothing is coming", () => {
    expect(focusCentre(keys, [], 0, 6, 1, 13)).toBeNull();
  });
  it("glides toward a target and never overshoots", () => {
    const a = approach(0, 10, 0.016), b = approach(a, 10, 0.016);
    expect(a).toBeGreaterThan(0); expect(a).toBeLessThan(b); expect(b).toBeLessThan(10);
    expect(approach(5, 5, 0.5)).toBe(5);
    expect(approach(3, 10, 0)).toBe(3);
    expect(approach(0, 10, 100)).toBeCloseTo(10, 3);
  });
});
