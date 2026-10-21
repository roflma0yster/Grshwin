import { useEffect, useRef, useState } from "react";

export function SheetMusic({ xml, zoom = 1.1 }: { xml: string; zoom?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = "";
      const osmd = new OpenSheetMusicDisplay(ref.current, { autoResize: true, drawTitle: true, backend: "svg" });
      try {
        await osmd.load(xml);
        osmd.zoom = zoom;
        osmd.render();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not render score");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [xml, zoom]);

  return (
    <div className="overflow-x-auto rounded-xl border bg-paper p-4 text-paper-ink">
      {error ? <p className="text-sm text-destructive">{error}</p> : <div ref={ref} />}
    </div>
  );
}
