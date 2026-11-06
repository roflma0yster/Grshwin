import { useEffect, useRef, useState, type RefObject } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { followDelta } from "@/lib/score-following";

type SheetMusicProps = {
  xml: string;
  zoom?: number;
  activeBar?: number | null;
  follow?: boolean;
  followRequest?: number;
  controlsRef?: RefObject<HTMLDivElement | null>;
  onManualScroll?: () => void;
};

export function SheetMusic({ xml, zoom = 1.1, activeBar = null, follow = false, followRequest = 0, controlsRef, onManualScroll }: SheetMusicProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const updateRef = useRef<() => void>(() => {});
  const latest = useRef({ activeBar, follow, controlsRef, onManualScroll });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { latest.current = { activeBar, follow, controlsRef, onManualScroll }; updateRef.current(); }, [activeBar, follow, followRequest, controlsRef, onManualScroll]);

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
        const osmd = new OpenSheetMusicDisplay(container, { autoResize: false, drawTitle: true, backend: "svg" });
        osmdRef.current = osmd;
        await osmd.load(xml);
        if (cancelled) return;
        osmd.zoom = zoom;
        function updateHighlight() {
          clearHighlight();
          const { activeBar: bar, follow: shouldFollow, controlsRef: toolbar } = latest.current;
          if (!bar || cancelled) return;
          const measures = osmd.GraphicSheet.MeasureList[bar - 1];
          if (!measures) return;
          // Each graphical measure belongs to one staff; group by its rendered system.
          const systems = new Map<NonNullable<typeof measures[number]>["ParentMusicSystem"], typeof measures>();
          for (const measure of measures) {
            if (!measure) continue;
            const group = systems.get(measure.ParentMusicSystem) ?? [];
            group.push(measure); systems.set(measure.ParentMusicSystem, group);
          }
          for (const [system, group] of systems) {
            const backend = osmd.Drawer.Backends.find((item) => item.graphicalMusicPage === system.Parent);
            if (!backend) continue;
            const boxes = group.map((measure) => measure.PositionAndShape);
            const left = Math.min(...boxes.map((box) => box.AbsolutePosition.x + box.BorderLeft));
            const right = Math.max(...boxes.map((box) => box.AbsolutePosition.x + box.BorderRight));
            const top = Math.min(...boxes.map((box) => box.AbsolutePosition.y + box.BorderTop));
            const bottom = Math.max(...boxes.map((box) => box.AbsolutePosition.y + box.BorderBottom));
            const pixel = (value: number) => osmd.Drawer.calculatePixelDistance(value);
            // Use the same backend conversion/transform as the rendered notes, including zoom and pages.
            const node = backend.renderRectangle(new RectangleF2D(pixel(left), pixel(top), pixel(right - left), pixel(bottom - top)), 0, undefined, 1);
            if (!(node instanceof Element)) continue;
            node.classList.add("score-active-bar"); node.setAttribute("data-active-bar", String(bar)); node.setAttribute("aria-hidden", "true");
            nodes.push(node);
            if (!shouldFollow) continue;
            const bounds = node.getBoundingClientRect();
            const scrollContainer = scroller.current;
            if (!scrollContainer) continue;
            const visible = scrollContainer.getBoundingClientRect();
            const controlsBottom = Math.max(0, toolbar?.current?.getBoundingClientRect().bottom ?? 0);
            const dy = followDelta(bounds.top, bounds.bottom, controlsBottom, window.innerHeight);
            const dx = followDelta(bounds.left, bounds.right, Math.max(0, visible.left), Math.min(window.innerWidth, visible.right));
            const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
            if (dy) window.scrollBy({ top: dy, behavior });
            if (dx) scrollContainer.scrollBy({ left: dx, behavior });
          }
        }
        updateRef.current = updateHighlight;
        osmd.render(); updateHighlight();
        let previousWidth = container.clientWidth;
        observer = new ResizeObserver(() => {
          if (cancelled || container.clientWidth === previousWidth) return;
          previousWidth = container.clientWidth;
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => { if (!cancelled) { osmd.render(); updateHighlight(); } });
        });
        observer.observe(container);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Could not render score"); }
    })();
    return () => {
      cancelled = true; observer?.disconnect(); cancelAnimationFrame(frame);
      clearHighlight(); updateRef.current = () => {}; osmdRef.current = null;
      ref.current?.replaceChildren();
    };
  }, [xml, zoom]);

  useEffect(() => {
    if (!activeBar) return;
    const manual = () => latest.current.onManualScroll?.();
    const keys = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input,select,textarea,button,[role=slider],[role=switch]") || target.isContentEditable)) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) manual();
    };
    const pointer = (event: PointerEvent) => {
      const container = scroller.current;
      if (event.clientX >= document.documentElement.clientWidth || (container && event.target === container)) manual();
    };
    // User gestures, not scroll events: our own smooth scrolling must never suspend following.
    window.addEventListener("wheel", manual, { passive: true });
    window.addEventListener("touchmove", manual, { passive: true });
    window.addEventListener("keydown", keys);
    window.addEventListener("pointerdown", pointer);
    return () => {
      window.removeEventListener("wheel", manual); window.removeEventListener("touchmove", manual);
      window.removeEventListener("keydown", keys); window.removeEventListener("pointerdown", pointer);
    };
  }, [activeBar]);

  return <div ref={scroller} aria-label="Sheet music" className="overflow-x-auto rounded-xl border bg-paper p-4 text-paper-ink">
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <div ref={ref} />}
  </div>;
}
