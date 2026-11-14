import { describe, expect, it } from "vitest";
import { DEFAULT_PLAY_ALONG, LOOK_AHEAD_RANGE, SYNC_RANGE, countInBeats, countInNumber, parsePlayAlongSettings, playRole, syncBeats, typicalBarBeats } from "@/lib/play-along";

describe("saved settings", () => {
  it("uses the defaults for missing, wrong or corrupt values", () => {
    for (const bad of [undefined, null, "x", 42, [], {}]) expect(parsePlayAlongSettings(bad)).toEqual(DEFAULT_PLAY_ALONG);
  });
  it("keeps valid values", () => {
    const s = { mode: "along", yourHand: "left", countInBars: 2, lookAhead: 6, syncMs: 80, showRoll: false } as const;
    expect(parsePlayAlongSettings(s)).toEqual(s);
  });
  it("clamps numbers into their ranges and rounds", () => {
    const s = parsePlayAlongSettings({ lookAhead: 99, syncMs: -9999 });
    expect(s.lookAhead).toBe(LOOK_AHEAD_RANGE.max);
    expect(s.syncMs).toBe(SYNC_RANGE.min);
    expect(parsePlayAlongSettings({ lookAhead: 0.5 }).lookAhead).toBe(LOOK_AHEAD_RANGE.min);
    expect(parsePlayAlongSettings({ syncMs: 12.7 }).syncMs).toBe(13);
  });
  it("only allows 0, 1 or 2 bars of count-in", () => {
    expect(parsePlayAlongSettings({ countInBars: 5 }).countInBars).toBe(2);
    expect(parsePlayAlongSettings({ countInBars: -3 }).countInBars).toBe(0);
    expect(parsePlayAlongSettings({ countInBars: 1.4 }).countInBars).toBe(1);
    expect(parsePlayAlongSettings({ countInBars: NaN }).countInBars).toBe(DEFAULT_PLAY_ALONG.countInBars);
  });
  it("ignores unknown modes and hands", () => {
    expect(parsePlayAlongSettings({ mode: "karaoke", yourHand: "feet" })).toMatchObject({ mode: "watch", yourHand: "right" });
  });
});

describe("who plays what", () => {
  const along = (yourHand: "right" | "left" | "both") => ({ ...DEFAULT_PLAY_ALONG, mode: "along" as const, yourHand });
  it("Watch plays what the Hands control selects, with no count-in and everything bright", () => {
    expect(playRole(DEFAULT_PLAY_ALONG, "both")).toEqual({ audible: "both", countInBars: 0, yourStaffs: null });
    expect(playRole(DEFAULT_PLAY_ALONG, "left").audible).toBe("left");
  });
  it("Play along plays the hand you are not playing", () => {
    expect(playRole(along("right"), "both").audible).toBe("left");
    expect(playRole(along("left"), "both").audible).toBe("right");
  });
  it("Play along with both hands plays only the click", () => {
    expect(playRole(along("both"), "both").audible).toBe("none");
  });
  it("marks your hands as the bright ones and counts you in", () => {
    const r = playRole({ ...along("right"), countInBars: 2 }, "both");
    expect([...r.yourStaffs!]).toEqual([1]);
    expect(r.countInBars).toBe(2);
    expect([...playRole(along("left"), "both").yourStaffs!]).toEqual([2]);
    expect([...playRole(along("both"), "both").yourStaffs!].sort()).toEqual([1, 2]);
  });
});

describe("count-in", () => {
  it("is whole bars of the piece's usual length", () => {
    expect(countInBeats([0, 4, 8, 12], 1)).toBe(4);
    expect(countInBeats([0, 3, 6, 9], 2)).toBe(6);
    expect(countInBeats([0, 6, 12], 1)).toBe(6);
  });
  it("ignores a short pickup bar", () => {
    expect(typicalBarBeats([0, 1, 5, 9, 13])).toBe(4);
    expect(countInBeats([0, 1, 5, 9], 1)).toBe(4);
  });
  it("is zero for no bars, and never more than two bars", () => {
    expect(countInBeats([0, 4, 8], 0)).toBe(0);
    expect(countInBeats([0, 4, 8], 5)).toBe(8);
    expect(countInBeats([0, 4, 8], NaN)).toBe(0);
  });
  it("falls back to four beats when the score has no bars", () => {
    expect(typicalBarBeats([])).toBe(4);
    expect(typicalBarBeats([0])).toBe(4);
  });
  it("shows 4, 3, 2, 1 and then nothing once the music starts", () => {
    expect([-4, -3.2, -2.5, -1.1, -0.4].map(countInNumber)).toEqual([4, 4, 3, 2, 1]);
    expect(countInNumber(0)).toBeNull();
    expect(countInNumber(2.5)).toBeNull();
  });
});

describe("visual sync", () => {
  it("converts milliseconds to beats at the tempo", () => {
    expect(syncBeats(0, 80)).toBe(0);
    expect(syncBeats(1000, 60)).toBeCloseTo(1, 5);
    expect(syncBeats(500, 120)).toBeCloseTo(1, 5);
    expect(syncBeats(-100, 60)).toBeCloseTo(-0.1, 5);
  });
});
