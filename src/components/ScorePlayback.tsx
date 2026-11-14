import { useEffect, useMemo, useState } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InstrumentSelect, useInstrumentChoice } from "@/components/InstrumentSelect";
import { usePlayback } from "@/hooks/use-playback";
import { usePlayAlongSettings } from "@/hooks/use-play-along";
import { FallingNotes } from "@/components/FallingNotes";
import { PlayAlongControls } from "@/components/PlayAlongControls";
import { playRole } from "@/lib/play-along";
import { parseNotes, type PlaybackHands } from "@/lib/music";

export function ScorePlayback({ xml }: { xml: string }) {
  const parsed = useMemo(() => parseNotes(xml), [xml]);
  const [tempo, setTempo] = useState(80);
  const [hands, setHands] = useState<PlaybackHands>("both");
  const [metronome, setMetronome] = useState(false);
  const [loop, setLoop] = useState(false);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [instrumentId, setInstrumentId] = useInstrumentChoice();
  const [along, updateAlong] = usePlayAlongSettings();
  const role = playRole(along, hands);
  const { playing, busy, current, bars, activeInstrument, play: startPlayback, stop, position } = usePlayback(parsed);
  useEffect(() => { setFrom(1); setTo(Math.min(4, bars) || 1); }, [xml, bars]);
  const play = () => startPlayback({ tempo, hands, metronome, loop, from, to, instrumentId, audible: role.audible, countInBars: role.countInBars });
  const locked = playing || busy;
  return <section aria-label="Score playback" className="mt-6 space-y-4 border-y py-4">
    <div className="flex flex-wrap items-center gap-6">
      <Button disabled={busy || !parsed.notes.length} onClick={playing ? stop : play}>{playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? "Stop" : "Play"}</Button>
      <div className="min-w-40 flex-1 space-y-2"><p className="text-sm">Tempo · ♩ = {tempo}</p><Slider aria-label="Tempo" value={[tempo]} min={30} max={180} step={2} disabled={locked} onValueChange={([v]) => setTempo(v ?? 80)} /></div>
      <p role="status" className="min-w-20 text-sm text-muted-foreground">{current ? `Bar ${current} / ${bars}` : `${bars} bars`}</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <ToggleGroup type="single" value={hands} onValueChange={(value) => { if (value === "both" || value === "left" || value === "right") setHands(value); }} disabled={locked} aria-label="Hands" variant="outline">
        <ToggleGroupItem value="both">Both hands</ToggleGroupItem><ToggleGroupItem value="right">Right hand</ToggleGroupItem><ToggleGroupItem value="left">Left hand</ToggleGroupItem>
      </ToggleGroup>
      <InstrumentSelect value={instrumentId} onChange={setInstrumentId} playingInstrument={activeInstrument} />
      <div className="flex items-center gap-2"><Switch id="score-metronome" checked={metronome} onCheckedChange={setMetronome} disabled={locked} /><Label htmlFor="score-metronome">Metronome</Label></div>
      <div className="flex flex-wrap items-center gap-2"><Switch id="score-loop" checked={loop} onCheckedChange={setLoop} disabled={locked || !bars} /><Label htmlFor="score-loop">Loop bars</Label>
        <Select value={String(from)} onValueChange={(value) => { const bar = Number(value); setFrom(bar); setTo(Math.max(bar, to)); }} disabled={locked || !loop}><SelectTrigger aria-label="First loop bar" className="w-16"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: bars }, (_, i) => <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>)}</SelectContent></Select>
        <span aria-hidden="true">–</span>
        <Select value={String(to)} onValueChange={(value) => setTo(Number(value))} disabled={locked || !loop}><SelectTrigger aria-label="Last loop bar" className="w-16"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: bars }, (_, i) => i + 1).filter((bar) => bar >= from).map((bar) => <SelectItem key={bar} value={String(bar)}>{bar}</SelectItem>)}</SelectContent></Select>
      </div>
    </div>
    <PlayAlongControls settings={along} update={updateAlong} locked={locked} />
    {along.showRoll && <FallingNotes parsed={parsed} loop={loop} from={from} to={to} tempo={tempo} playing={playing} getPosition={position} settings={along} role={role} bar={current} />}
  </section>;
}