import { describe, expect, it } from "vitest";
import { barTransitions, followDelta, followSuspended } from "@/lib/score-following";

describe("score following", () => {
  it("follows actual pickup and variable bar lengths at the selected tempo", () => {
    expect(barTransitions([0, 1, 5, 8, 12], 0, 4, 120)).toEqual([
      { bar: 1, seconds: 0 }, { bar: 2, seconds: 0.5 }, { bar: 3, seconds: 2.5 }, { bar: 4, seconds: 4 },
    ]);
  });
  it("starts loop transitions at zero and preserves selected bar numbers", () => {
    expect(barTransitions([0, 1, 5, 8, 12], 1, 3, 60)).toEqual([{ bar: 2, seconds: 0 }, { bar: 3, seconds: 4 }]);
  });
  it("suspends after manual scrolling until resume", () => {
    expect(followSuspended(false, "manual")).toBe(true);
    expect(followSuspended(true, "stop")).toBe(true);
    expect(followSuspended(true, "resume")).toBe(false);
  });
  it("resumes on a new playback run", () => {
    expect(followSuspended(true, "start")).toBe(false);
  });
  it("does not scroll a comfortably visible bar", () => {
    expect(followDelta(250, 400, 180, 900)).toBe(0);
  });
  it("scrolls down for upcoming systems and back up for loop restarts", () => {
    expect(followDelta(820, 1000, 180, 900)).toBe(592);
    expect(followDelta(50, 150, 180, 900)).toBe(-178);
  });
});