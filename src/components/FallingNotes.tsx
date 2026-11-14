import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedScore } from "@/hooks/use-playback";
import { approach, focusCentre, laneCapacity, windowStartFor, wrapLoop } from "@/lib/piano-roll";
import { buildRollModel, drawRoll } from "@/lib/piano-roll-draw";
import { syncBeats, type PlayAlongSettings, type PlayRole } from "@/lib/play-along";

type Props = {
  parsed: ParsedScore | null;
  loop: boolean;
  from: number;
  to: number;
  /** The tempo the score is playing at (used only to turn the sync offset into beats). */
  tempo: number;
  playing: boolean;
  /** Beats since the start of the practice range, negative during the count-in, null when stopped. Called every frame. */
  getPosition: () => number | null;
  settings: PlayAlongSettings;
  role: PlayRole;
  /** Current bar, for the screen-reader label only. */
  bar: number | null;
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * The note highway. All drawing is in src/lib/piano-roll-draw.ts; this component only owns the canvas,
 * its size, and the animation frame loop. It draws imperatively (no React state per frame), only runs
 * the loop while playing and the tab is visible, and shows a still preview of the first beats otherwise.
 */
export function FallingNotes({ parsed, loop, from, to, tempo, playing, getPosition, settings, role, bar }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const model = useMemo(() => (parsed ? buildRollModel(parsed, loop, from, to) : null), [parsed, loop, from, to]);
  const latest = useRef({ getPosition, tempo, loop, settings, role });
  latest.current = { getPosition, tempo, loop, settings, role };
  const windowStart = useRef(0);
  const height = clamp(Math.round(width * 0.5), 200, 340);
  // a stable key: the hands Set is a new object each render, which must not restart the drawing loop
  const yourKey = role.yourStaffs ? [...role.yourStaffs].sort().join(",") : "all";

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => { const w = Math.floor(entries[0]?.contentRect.width ?? 0); if (w > 0) setWidth(w); });
    observer.observe(el);
    return () => observer.disconnect();
  }, [settings.showRoll]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !model || width <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gutter = Math.max(40, Math.min(64, width * 0.055));
    const capacity = Math.min(model.totalWhite, laneCapacity(width - gutter - 10));
    let raf = 0, last = performance.now();

    const frame = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      const { getPosition: read, tempo: bpm, loop: looping, settings: s, role: r } = latest.current;
      const raw = read();
      const position = raw === null ? 0 : wrapLoop(raw, model.span, looping) + syncBeats(s.syncMs, bpm);
      const centre = focusCentre(model.keys, model.notes, Math.max(0, position), s.lookAhead, model.maxDuration, capacity, r.yourStaffs);
      const target = windowStartFor(model.totalWhite, capacity, centre);
      windowStart.current = raw === null ? target : approach(windowStart.current, target, dt); // glide while playing, snap when idle
      drawRoll(ctx, model, { width, height, dpr, position, lookAhead: s.lookAhead, windowStart: windowStart.current, whiteCapacity: capacity, yourStaffs: r.yourStaffs, reducedMotion: reduced });
      if (playing && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const resume = () => { if (playing && !document.hidden) { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); } };
    frame(performance.now());
    document.addEventListener("visibilitychange", resume);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", resume); };
  }, [model, width, height, playing, settings.lookAhead, settings.syncMs, yourKey]);

  if (!settings.showRoll) return null;
  const label = `Falling notes. Upcoming notes for each hand fall toward the piano keyboard${bar ? `. Current bar ${bar}` : ""}.${role.yourStaffs ? " Your hand is shown bright; the other hand is backing." : ""}`;
  return (
    <div ref={wrapRef} className="w-full overflow-hidden rounded-xl border bg-black/40">
      <canvas ref={canvasRef} role="img" aria-label={label} style={{ width: "100%", height, display: "block" }} />
    </div>
  );
}
