import { describe, expect, it } from "vitest";
import { fitZoom, paneScrollTarget, zoomChanged } from "@/lib/score-stage";

describe("sheet pane scrolling", () => {
  it("moves the new line to the top of the pane", () => {
    expect(paneScrollTarget(400, 0, 300, 2000)).toBe(392);
  });
  it("does not scroll while the music stays on the same line", () => {
    expect(paneScrollTarget(400, 392, 300, 2000)).toBeNull();
    expect(paneScrollTarget(400, 391, 300, 2000)).toBeNull();
  });
  it("never scrolls past either end of the score", () => {
    expect(paneScrollTarget(3, 100, 300, 2000)).toBe(0);
    expect(paneScrollTarget(1900, 0, 300, 2000)).toBe(1700);
  });
  it("does nothing when the content fits or a measurement is unusable", () => {
    expect(paneScrollTarget(50, 0, 300, 200)).toBeNull();
    expect(paneScrollTarget(NaN, 0, 300, 2000)).toBeNull();
    expect(paneScrollTarget(400, 0, 0, 2000)).toBeNull();
  });
});

describe("fitting a line into the pane", () => {
  it("keeps the zoom when a line already fits", () => {
    expect(fitZoom(1.2, 200, 300)).toBe(1.2);
  });
  it("shrinks the zoom so one line fits", () => {
    expect(fitZoom(1.2, 400, 216)).toBeCloseTo(0.6, 2); // room = 200
  });
  it("never goes below the minimum and ignores bad input", () => {
    expect(fitZoom(1.2, 1000, 100)).toBe(0.5);
    expect(fitZoom(1.2, 0, 300)).toBe(1.2);
    expect(fitZoom(1.2, 400, 10)).toBe(1.2);
  });
  it("re-renders only for a meaningful zoom change", () => {
    expect(zoomChanged(1.2, 1.19)).toBe(false);
    expect(zoomChanged(1.2, 0.8)).toBe(true);
  });
});
