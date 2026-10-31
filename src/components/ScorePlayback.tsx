import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseNotes, practiceNotes, type PlaybackHands } from "@/lib/music";

export function ScorePlayback({ xml }: { xml: string }) {
  const parsed = useMemo(() => parseNotes(xml), [xml]);
  const [tempo, setTempo] = useState(80);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hands, setHands] = useState<PlaybackHands>("both");
  const [metronome, setMetronome] = useState(false);
  const [loop, setLoop] = useState(false);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [current, setCurrent] = useState<number | null>(null);
  const generation = useRef(0);
  const bars = Math.max(0, parsed.measureStarts.length - 1);
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => {
    setFrom(1); setTo(Math.min(4, bars) || 1); setPlaying(false); setCurrent(null);
    return () => { generation.current += 1; stopRef.current(); stopRef.current = () => {}; };
  }, [xml, bars]);
  function stop() { stopRef.current(); stopRef.current = () => {}; setPlaying(false); setCurrent(null); }
  async function play() {
    const attempt = ++generation.current;
    setBusy(true);
    let dispose = () => {};
    try {
      const Tone = await import("tone"); await Tone.start();
      if (attempt !== generation.current) return;
      const synth = new Tone.PolySynth(Tone.Synth).toDestination(); synth.volume.value = -12;
      const click = new Tone.MembraneSynth().toDestination(); click.volume.value = -18;
      const transport = Tone.getTransport(); transport.stop(); transport.cancel(); transport.loop = false;
      dispose = () => { transport.stop(); transport.cancel(); transport.loop = false; synth.dispose(); click.dispose(); };
      stopRef.current = dispose;
      const beat = 60 / tempo;
      const first = loop ? from - 1 : 0;
      const last = loop ? to : bars;
      const begin = parsed.measureStarts[first] ?? 0;
      const end = parsed.measureStarts[last] ?? 0;
      if (end <= begin) { stop(); return; }
      practiceNotes(parsed.notes, begin, end, hands).forEach((n) => transport.schedule((time) => synth.triggerAttackRelease(n.pitch, Math.max(0.05, n.duration * beat * 0.9), time), n.start * beat));
      for (let bar = first; bar < last; bar++) {
        transport.schedule((time) => Tone.getDraw().schedule(() => setCurrent(bar + 1), time), ((parsed.measureStarts[bar] ?? 0) - begin) * beat);
      }
      if (metronome) for (let pulse = 0; pulse < end - begin; pulse++) {
        transport.schedule((time) => click.triggerAttackRelease(parsed.measureStarts.includes(begin + pulse) ? "C3" : "G2", 0.04, time), pulse * beat);
      }
      if (loop) { transport.loop = true; transport.loopStart = 0; transport.loopEnd = (end - begin) * beat; }
      else transport.schedule((time) => Tone.getDraw().schedule(stop, time), (end - begin) * beat + 0.5);
      transport.start("+0.1"); setPlaying(true);
    } catch { dispose(); stopRef.current = () => {}; setPlaying(false); toast.error("Playback could not start. Please try again."); }
    finally { setBusy(false); }
  }
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
      <div className="flex items-center gap-2"><Switch id="score-metronome" checked={metronome} onCheckedChange={setMetronome} disabled={locked} /><Label htmlFor="score-metronome">Metronome</Label></div>
      <div className="flex flex-wrap items-center gap-2"><Switch id="score-loop" checked={loop} onCheckedChange={setLoop} disabled={locked || !bars} /><Label htmlFor="score-loop">Loop bars</Label>
        <Select value={String(from)} onValueChange={(value) => { const bar = Number(value); setFrom(bar); setTo(Math.max(bar, to)); }} disabled={locked || !loop}><SelectTrigger aria-label="First loop bar" className="w-16"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: bars }, (_, i) => <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>)}</SelectContent></Select>
        <span aria-hidden="true">–</span>
        <Select value={String(to)} onValueChange={(value) => setTo(Number(value))} disabled={locked || !loop}><SelectTrigger aria-label="Last loop bar" className="w-16"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: bars }, (_, i) => i + 1).filter((bar) => bar >= from).map((bar) => <SelectItem key={bar} value={String(bar)}>{bar}</SelectItem>)}</SelectContent></Select>
      </div>
    </div>
  </section>;
}