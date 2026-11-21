import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  /** The always-visible row: Play/Stop, tempo, bar counter. Keep it to one or two lines. */
  toolbar: ReactNode;
  /** Everything else (hands, instrument, loop, play-along, auto-scroll); collapsed by default. */
  options: ReactNode;
  /** The sheet music pane. It fills its cell and scrolls itself. */
  sheet: ReactNode;
  /** The falling-notes roll, or null when it is switched off (the sheet then takes the whole stage). */
  roll: ReactNode | null;
};

/**
 * The play-along stage: one pinned box with a compact control bar, the sheet music above and the falling
 * notes below. The two panes are separate grid rows, so the roll can never cover the score; with the roll
 * on, each row is exactly half of the space under the control bar. The page itself does not scroll to follow.
 */
export function ScoreStage({ toolbar, options, sheet, roll }: Props) {
  return (
    <section aria-label="Practice stage" className="sticky top-2 z-10 mt-4 flex h-[calc(100dvh-10rem)] min-h-[26rem] flex-col gap-2 rounded-2xl border bg-card p-3 shadow-soft md:h-[calc(100dvh-6rem)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{toolbar}</div>
      <details className="group text-sm">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          Options <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-2 max-h-[40vh] space-y-3 overflow-y-auto pr-1">{options}</div>
      </details>
      <div className={`grid min-h-0 flex-1 gap-2 ${roll ? "grid-rows-2" : "grid-rows-1"}`}>
        <div className="min-h-0">{sheet}</div>
        {roll && <div className="min-h-0">{roll}</div>}
      </div>
    </section>
  );
}
