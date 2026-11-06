import { pageHead } from "@/lib/head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SheetMusic } from "@/components/SheetMusic";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { demoMusicXml, parseNotes } from "@/lib/music";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/piece/$id")({
  head: () => pageHead("Piece player — Grshwin", "Practise a piece with tempo, looping and metronome."),
  component: PiecePlayer,
});

type Hands = "both" | "right" | "left";

function PiecePlayer() {
  const { id } = Route.useParams();
  const { data: piece } = useQuery({
    queryKey: ["piece", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pieces").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: xml } = useQuery({
    queryKey: ["piece-xml", id, piece?.musicxml_url],
    enabled: !!piece,
    queryFn: async () => (piece!.musicxml_url ? await (await fetch(piece!.musicxml_url)).text() : demoMusicXml(piece!.title)),
  });

  const [tempo, setTempo] = useState(80);
  const [hands, setHands] = useState<Hands>("both");
  const [metronome, setMetronome] = useState(true);
  const [loop, setLoop] = useState(false);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => { if (piece) setTempo(piece.default_tempo); }, [piece]);
  const parsed = useMemo(() => (xml ? parseNotes(xml) : null), [xml]);
  const measureCount = parsed ? parsed.measureStarts.length - 1 : 0;
  useEffect(() => { if (measureCount) setTo(Math.min(4, measureCount)); }, [measureCount]);
  useEffect(() => () => stopRef.current(), []);

  async function play() {
    if (!parsed) return;
    const Tone = await import("tone");
    await Tone.start();
    const transport = Tone.getTransport();
    transport.cancel();
    transport.stop();
    transport.bpm.value = tempo;
    const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.3, release: 0.8 } }).toDestination();
    synth.volume.value = -8;
    const click = new Tone.MembraneSynth({ octaves: 2, envelope: { attack: 0.001, decay: 0.08, sustain: 0 } }).toDestination();
    click.volume.value = -12;

    const startM = loop ? from - 1 : 0;
    const endM = loop ? to : measureCount;
    const t0 = parsed.measureStarts[startM] ?? 0;
    const t1 = parsed.measureStarts[endM] ?? 0;
    const beat = 60 / tempo;
    const notes = parsed.notes.filter(
      (n) => n.measure >= startM && n.measure < endM && (hands === "both" || (hands === "right" ? n.staff === 1 : n.staff === 2)),
    );
    notes.forEach((n) => transport.schedule((time) => synth.triggerAttackRelease(n.pitch, n.duration * beat * 0.95, time), (n.start - t0) * beat));
    for (let m = startM; m < endM; m++) {
      transport.schedule(() => setCurrent(m + 1), ((parsed.measureStarts[m] ?? 0) - t0) * beat);
    }
    if (metronome) {
      for (let b = 0; b < t1 - t0; b++) {
        const isDown = parsed.measureStarts.includes(t0 + b);
        transport.schedule((time) => click.triggerAttackRelease(isDown ? "C3" : "G2", "32n", time), b * beat);
      }
    }
    if (loop) {
      transport.loop = true;
      transport.loopStart = 0;
      transport.loopEnd = (t1 - t0) * beat;
    } else {
      transport.loop = false;
      transport.schedule(() => stop(), (t1 - t0) * beat + 0.5);
    }
    stopRef.current = () => {
      transport.stop();
      transport.cancel();
      synth.dispose();
      click.dispose();
    };
    transport.start("+0.1");
    setPlaying(true);
  }

  function stop() {
    stopRef.current();
    stopRef.current = () => {};
    setPlaying(false);
    setCurrent(null);
  }

  if (!piece) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <>
      <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground">← Library</Link>
      <Link to="/library" search={{ like: id }} className="ml-4 text-sm text-muted-foreground hover:text-foreground">More like this</Link>
      <h1 className="mt-2 font-display text-3xl md:text-4xl">{piece.title}</h1>
      <p className="text-muted-foreground">{piece.composer} · {piece.key_signature} · {piece.difficulty}</p>
      {!piece.musicxml_url && (
        <p className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm text-accent-foreground">
          Full score to be uploaded — showing a short demo excerpt so you can try the player.
        </p>
      )}

      <div className="sticky top-0 z-10 mt-6 grid gap-4 rounded-2xl border bg-card p-4 shadow-soft md:grid-cols-[auto_1fr_auto] md:items-center">
        <Button size="lg" onClick={playing ? stop : play} disabled={!parsed}>
          {playing ? <><Square className="h-4 w-4" /> Stop</> : <><Play className="h-4 w-4" /> Play</>}
        </Button>
        <div className="space-y-2">
          <div className="flex justify-between text-sm"><span>Tempo</span><span className="font-semibold">♩ = {tempo}</span></div>
          <Slider min={30} max={180} step={2} value={[tempo]} onValueChange={([v]) => setTempo(v ?? 80)} disabled={playing} />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="met" checked={metronome} onCheckedChange={setMetronome} disabled={playing} />
          <Label htmlFor="met">Metronome</Label>
        </div>
        <div className="flex gap-1 md:col-span-3">
          {(["both", "right", "left"] as Hands[]).map((h) => (
            <button key={h} disabled={playing} onClick={() => setHands(h)} className={cn("rounded-full border px-3 py-1 text-sm capitalize", hands === h && "border-primary bg-accent text-accent-foreground")}>
              {h === "both" ? "Hands together" : `${h} hand`}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Switch id="loop" checked={loop} onCheckedChange={setLoop} disabled={playing} />
            <Label htmlFor="loop">Loop bars</Label>
            <select className="rounded border bg-background px-1" value={from} disabled={playing} onChange={(e) => { const v = +e.target.value; setFrom(v); if (to < v) setTo(v); }}>
              {Array.from({ length: measureCount }, (_, i) => <option key={i}>{i + 1}</option>)}
            </select>
            –
            <select className="rounded border bg-background px-1" value={to} disabled={playing} onChange={(e) => setTo(Math.max(from, +e.target.value))}>
              {Array.from({ length: measureCount }, (_, i) => <option key={i}>{i + 1}</option>)}
            </select>
          </div>
        </div>
        {current && <p className="text-sm text-muted-foreground md:col-span-3">Bar {current}</p>}
      </div>

      <div className="mt-6">{xml && <SheetMusic xml={xml} zoom={1.2} />}</div>
      <p className="mt-4 text-xs text-muted-foreground">{piece.license}{piece.source_url && <> · <a className="underline" href={piece.source_url} target="_blank" rel="noreferrer">Source</a></>}</p>
    </>
  );
}
