import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { parseNotes } from "@/lib/music";

export function ScorePlayback({ xml }: { xml: string }) {
  const parsed = useMemo(() => parseNotes(xml), [xml]);
  const [tempo, setTempo] = useState(80);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => () => stopRef.current(), []);
  function stop() { stopRef.current(); stopRef.current = () => {}; setPlaying(false); }
  async function play() {
    setBusy(true);
    try {
      const Tone = await import("tone"); await Tone.start();
      const synth = new Tone.PolySynth(Tone.Synth).toDestination(); synth.volume.value = -12;
      const transport = Tone.getTransport(); transport.stop(); transport.cancel(); transport.loop = false;
      const beat = 60 / tempo;
      parsed.notes.forEach((n) => transport.schedule((time) => synth.triggerAttackRelease(n.pitch, Math.max(0.05, n.duration * beat * 0.9), time), n.start * beat));
      transport.schedule(() => stop(), (parsed.measureStarts.at(-1) ?? 0) * beat + 0.5);
      stopRef.current = () => { transport.stop(); transport.cancel(); synth.dispose(); };
      transport.start("+0.1"); setPlaying(true);
    } catch { toast.error("Playback could not start. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="mt-6 flex flex-wrap items-center gap-6 border-y py-4"><Button disabled={busy || !parsed.notes.length} onClick={playing ? stop : play}>{playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? "Stop" : "Play"}</Button><div className="min-w-40 flex-1 space-y-2"><p className="text-sm">Tempo · ♩ = {tempo}</p><Slider aria-label="Tempo" value={[tempo]} min={30} max={180} step={2} disabled={playing} onValueChange={([v]) => setTempo(v ?? 80)} /></div><p className="text-sm text-muted-foreground">{parsed.measureStarts.length - 1} bars</p></div>;
}