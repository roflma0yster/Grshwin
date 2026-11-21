/** Pure layout rules for the play-along stage: the sheet pane shows one system (line) at a time. */

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Breathing room kept above the active system, in pixels. */
export const PANE_PAD = 8;

/**
 * The scrollTop that puts the active system at the top of the pane, or null when the pane is already there
 * (so staying on the same line never scrolls, and the pane only moves when the music reaches a new line).
 * `systemTop` is measured from the top of the scrollable content, not the viewport.
 */
export function paneScrollTarget(systemTop: number, scrollTop: number, paneHeight: number, contentHeight: number, pad = PANE_PAD) {
  if (![systemTop, scrollTop, paneHeight, contentHeight].every(Number.isFinite) || paneHeight <= 0) return null;
  const target = clamp(systemTop - pad, 0, Math.max(0, contentHeight - paneHeight));
  return Math.abs(target - scrollTop) < 2 ? null : target;
}

/**
 * A zoom at which one system fits inside the pane. Only ever shrinks the requested zoom (a short pane never
 * enlarges the score), and never below `min` so notation stays legible; a very short pane then scrolls instead.
 */
export function fitZoom(zoom: number, systemHeight: number, paneHeight: number, pad = PANE_PAD, min = 0.5) {
  if (![zoom, systemHeight, paneHeight].every(Number.isFinite) || systemHeight <= 0 || paneHeight <= 0) return zoom;
  const room = paneHeight - 2 * pad;
  if (room <= 0 || systemHeight <= room) return zoom;
  return Math.max(min, Math.round((zoom * room / systemHeight) * 100) / 100);
}

/** True when the fitted zoom is different enough from the current one to be worth a re-render. */
export function zoomChanged(current: number, next: number) {
  return Math.abs(next - current) / Math.max(current, 0.01) > 0.02;
}
