import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { fitZoom, paneScrollTarget, zoomChanged } from "@/lib/score-stage";

type SystemOf = NonNullable<OpenSheetMusicDisplay["GraphicSheet"]["MeasureList"][number][number]>["ParentMusicSystem"];

type SheetMusicProps = {
  xml: string;
  zoom?: number;
  activeBar?: number | null;
  follow?: boolean;
  followRequest?: number;
  onManualScroll?: () => void;
};

/**
 * The score, in a pane that fills its parent and scrolls on its own. The page never scrolls to follow the
 * music: when playback reaches a new line the pane scrolls that line to its top, and the zoom is reduced
 * just enough that one line fits in the pane. The parent decides the pane's height.
 */
export function SheetMusic({ xml, zoom = 1.1, activeBar = null, follow = false, followRequest = 0, onManualScroll }: SheetMusicProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const updateRef = useRef<() => void>(() => {});
  const latest = useRef({ activeBar, follow, onManualScroll });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { latest.current = { activeBar, follow, onManualScroll }; updateRef.current(); }, [activeBar, follow, followRequest, onManualScroll]);

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let frame = 0;
    const nodes: Element[] = [];
    function clearHighlight() { nodes.splice(0).forEach((node) => node.remove()); }
    setError(null);
    (async () => {
      try {
        const { OpenSheetMusicDisplay, RectangleF2D } = await import("opensheetmusicdisplay");
        const container = ref.current;
        if (cancelled || !container) return;
        container.innerHTML = "";
        const osmd = new OpenSheetMusicDisplay(container, { autoResize: false, drawTitle: false, backend: "svg" });
        await osmd.load(xml);
        if (cancelled) return;
        osmd.zoom = zoom;

        // The bar's bounds on its rendered system, in OSMD units, one entry per page the bar sits on.
        function barBoxes(bar: number) {
          const measures = osmd.GraphicSheet.MeasureList[bar - 1];
          if (!measures) return [];
          // Each graphical measure belongs to one staff; group by its rendered system.
          const systems = new Map<NonNullable<typeof measures[number]>["ParentMusicSystem"], typeof measures>();
          for (const measure of measures) {
            if (!measure) continue;
            const group = systems.get(measure.ParentMusicSystem) ?? [];
            group.push(measure); systems.set(measure.ParentMusicSystem, group);
          }
          const result: { system: SystemOf; left: number; right: number; top: number; bottom: number }[] = [];
          for (const [system, group] of systems) {
            const boxes = group.map((measure) => measure.PositionAndShape);
            result.push({
              system,
              left: Math.min(...boxes.map((box) => box.AbsolutePosition.x + box.BorderLeft)),
              right: Math.max(...boxes.map((box) => box.AbsolutePosition.x + box.BorderRight)),
              top: Math.min(...boxes.map((box) => box.AbsolutePosition.y + box.BorderTop)),
              bottom: Math.max(...boxes.map((box) => box.AbsolutePosition.y + box.BorderBottom)),
            });
          }
          return result;
        }

        function updateHighlight() {
          clearHighlight();
          const { activeBar: bar, follow: shouldFollow } = latest.current;
          if (!bar || cancelled) return;
          for (const box of barBoxes(bar)) {
            const backend = osmd.Drawer.Backends.find((item) => item.graphicalMusicPage === box.system.Parent);
            if (!backend) continue;
            const pixel = (value: number) => osmd.Drawer.calculatePixelDistance(value);
            // Use the same backend conversion/transform as the rendered notes, including zoom and pages.
            const node = backend.renderRectangle(new RectangleF2D(pixel(box.left), pixel(box.top), pixel(box.right - box.left), pixel(box.bottom - box.top)), 0, "var(--score-highlight)", 1);
            if (!(node instanceof Element)) continue;
            node.classList.add("score-active-bar"); node.setAttribute("data-active-bar", String(bar)); node.setAttribute("aria-hidden", "true");
            nodes.push(node);
            const pane = scroller.current;
            if (!shouldFollow || !pane) continue;
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const behavior = reduced ? "instant" : "smooth";
            const paneRect = pane.getBoundingClientRect();
            const bounds = node.getBoundingClientRect();
            // Positions relative to the scrollable content, so they do not depend on the current scroll.
            const top = pane.scrollTop + bounds.top - paneRect.top;
            const target = paneScrollTarget(top, pane.scrollTop, pane.clientHeight, pane.scrollHeight);
            if (target !== null) pane.scrollTo({ top: target, behavior });
            // A bar can run off the side when the score is wider than the pane (small screens at a big zoom).
            const left = bounds.left - paneRect.left, right = bounds.right - paneRect.left;
            if (left < 0 || right > pane.clientWidth) pane.scrollBy({ left: left < 0 ? left - 16 : Math.min(left - 16, right - pane.clientWidth + 16), behavior });
          }
        }
        updateRef.current = updateHighlight;

        // Shrink the zoom just enough that one system fits the pane (bar 1's height stands for a system's).
        function fitAndRender() {
          const pane = scroller.current;
          osmd.render();
          if (!pane) return;
          const first = barBoxes(1)[0];
          if (!first) return;
          const systemHeight = osmd.Drawer.calculatePixelDistance(first.bottom - first.top);
          const next = fitZoom(zoom, systemHeight / osmd.zoom * zoom, pane.clientHeight);
          if (zoomChanged(osmd.zoom, next)) { osmd.zoom = next; osmd.render(); }
        }
        fitAndRender(); updateHighlight();

        let previous = `${container.clientWidth}x${scroller.current?.clientHeight ?? 0}`;
        observer = new ResizeObserver(() => {
          const size = `${container.clientWidth}x${scroller.current?.clientHeight ?? 0}`;
          if (cancelled || size === previous) return;
          previous = size;
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => { if (!cancelled) { osmd.zoom = zoom; fitAndRender(); updateHighlight(); } });
        });
        observer.observe(container);
        if (scroller.current) observer.observe(scroller.current);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Could not render score"); }
    })();
    return () => {
      cancelled = true; observer?.disconnect(); cancelAnimationFrame(frame);
      clearHighlight(); updateRef.current = () => {};
      ref.current?.replaceChildren();
    };
  }, [xml, zoom]);

  useEffect(() => {
    const pane = scroller.current;
    if (!activeBar || !pane) return;
    const manual = () => latest.current.onManualScroll?.();
    const keys = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input,select,textarea,button,[role=slider],[role=switch]") || target.isContentEditable)) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) manual();
    };
    // Only the user's own gestures on the pane, not scroll events: our smooth scrolling must never suspend following.
    const pointer = (event: PointerEvent) => { if (event.target === pane) manual(); }; // the pane's own scrollbar
    pane.addEventListener("wheel", manual, { passive: true });
    pane.addEventListener("touchmove", manual, { passive: true });
    pane.addEventListener("pointerdown", pointer);
    window.addEventListener("keydown", keys);
    return () => {
      pane.removeEventListener("wheel", manual); pane.removeEventListener("touchmove", manual);
      pane.removeEventListener("pointerdown", pointer); window.removeEventListener("keydown", keys);
    };
  }, [activeBar]);

  return <div ref={scroller} role="region" aria-label="Sheet music" tabIndex={0} className="h-full overflow-auto rounded-xl border bg-paper p-2 text-paper-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <div ref={ref} />}
  </div>;
}
