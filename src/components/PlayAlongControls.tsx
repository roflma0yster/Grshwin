import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { LOOK_AHEAD_RANGE, SYNC_RANGE, type PlayAlongSettings, type YourHand } from "@/lib/play-along";

type Props = {
  settings: PlayAlongSettings;
  update: (patch: Partial<PlayAlongSettings>) => void;
  /** True while playing or starting: mode, hand and count-in cannot change mid-run (the visual settings can). */
  locked: boolean;
};

const HANDS: { value: YourHand; label: string }[] = [{ value: "right", label: "Right" }, { value: "left", label: "Left" }, { value: "both", label: "Both" }];

export function PlayAlongControls({ settings, update, locked }: Props) {
  const along = settings.mode === "along";
  return (
    <section aria-label="Play along" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div role="group" aria-label="Mode" className="flex gap-1">
          <Button size="sm" variant={along ? "outline" : "secondary"} aria-pressed={!along} disabled={locked} onClick={() => update({ mode: "watch" })}>Watch</Button>
          <Button size="sm" variant={along ? "secondary" : "outline"} aria-pressed={along} disabled={locked} onClick={() => update({ mode: "along" })}>Play along</Button>
        </div>
        {along && <>
          <div role="group" aria-label="Your hand" className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Your hand</span>
            {HANDS.map((h) => <Button key={h.value} size="sm" variant={settings.yourHand === h.value ? "secondary" : "outline"} aria-pressed={settings.yourHand === h.value} disabled={locked} onClick={() => update({ yourHand: h.value })}>{h.label}</Button>)}
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Label htmlFor="count-in" className="text-muted-foreground">Count-in</Label>
            <select id="count-in" className="rounded border bg-background px-1.5 py-1" value={settings.countInBars} disabled={locked} onChange={(e) => update({ countInBars: Number(e.target.value) as 0 | 1 | 2 })}>
              <option value={0}>Off</option><option value={1}>1 bar</option><option value={2}>2 bars</option>
            </select>
          </div>
        </>}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Switch id="show-roll" checked={settings.showRoll} onCheckedChange={(v) => update({ showRoll: v })} />
          <Label htmlFor="show-roll">Falling notes</Label>
        </div>
      </div>
      {along && <p className="text-xs text-muted-foreground">{settings.yourHand === "both" ? "You play both hands. Only the click is heard." : `You play the ${settings.yourHand} hand. The ${settings.yourHand === "right" ? "left" : "right"} hand plays for you.`}</p>}
      {settings.showRoll && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">View settings</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex justify-between"><Label htmlFor="fall-speed">Fall speed</Label><span className="text-muted-foreground">{settings.lookAhead} beats ahead</span></div>
              <Slider id="fall-speed" aria-label="Beats shown ahead" min={LOOK_AHEAD_RANGE.min} max={LOOK_AHEAD_RANGE.max} step={0.5} value={[settings.lookAhead]} onValueChange={([v]) => update({ lookAhead: v ?? settings.lookAhead })} />
              <p className="text-xs text-muted-foreground">Fewer beats means notes fall faster and you see less of what is coming.</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between"><Label htmlFor="visual-sync">Visual sync</Label><span className="text-muted-foreground">{settings.syncMs} ms</span></div>
              <Slider id="visual-sync" aria-label="Visual sync offset in milliseconds" min={SYNC_RANGE.min} max={SYNC_RANGE.max} step={10} value={[settings.syncMs]} onValueChange={([v]) => update({ syncMs: v ?? settings.syncMs })} />
              <p className="text-xs text-muted-foreground">If the notes reach the line before or after you hear them, nudge this.</p>
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
