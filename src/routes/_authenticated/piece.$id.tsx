import { pageHead } from "@/lib/head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, LocateFixed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SheetMusic } from "@/components/SheetMusic";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { demoMusicXml, parseNotes } from "@/lib/music";
import { followSuspended } from "@/lib/score-following";
import { usePlayback } from "@/hooks/use-playback";
import { usePlayAlongSettings } from "@/hooks/use-play-along";
import { FallingNotes } from "@/components/FallingNotes";
import { PlayAlongControls } from "@/components/PlayAlongControls";
import { playRole } from "@/lib/play-along";
import { InstrumentSelect, useInstrumentChoice } from "@/components/InstrumentSelect";

export const Route = createFileRoute("/_authenticated/piece/$id")({
  head: () => pageHead("Piece player — Grshwin", "Practice a piece with tempo, looping and metronome."),
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
    queryFn: async () => {
      if (!piece) throw new Error("The piece is unavailable.");
      if (!piece.musicxml_url) return demoMusicXml(piece.title);
      const response = await fetch(piece.musicxml_url);
      if (!response.ok) throw new Error("The score could not be loaded.");
      return response.text();
    },
  });

  const [tempo, setTempo] = useState(80);
  const [hands, setHands] = useState<Hands>("both");
  const [metronome, setMetronome] = useState(true);
  const [loop, setLoop] = useState(false);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(4);
  const [autoScroll, setAutoScroll] = useState(true);
  const [suspended, setSuspended] = useState(false);
  const [followRequest, setFollowRequest] = useState(0);
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (piece) setTempo(piece.default_tempo); }, [piece]);
  const parsed = useMemo(() => (xml ? parseNotes(xml) : null), [xml]);
  const measureCount = parsed ? parsed.measureStarts.length - 1 : 0;
  useEffect(() => { if (measureCount) setTo(Math.min(4, measureCount)); }, [measureCount]);
  useEffect(() => { setFrom(1); }, [xml]);

  const [instrumentId, setInstrumentId] = useInstrumentChoice();
  const [along, updateAlong] = usePlayAlongSettings();
  const role = playRole(along, hands);
  const { playing, busy, current, activeInstrument, play: startPlayback, stop, position } = usePlayback(parsed, {
    onBar: () => setFollowRequest((value) => value + 1),
    onStart: () => setSuspended((value) => followSuspended(value, "start")),
  });
  const play = () => startPlayback({ tempo, hands, metronome, loop, from, to, instrumentId, audible: role.audible, countInBars: role.countInBars });
  const locked = playing || busy;

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

      <div ref={controlsRef} data-score-controls className="sticky top-0 z-10 mt-6 grid gap-4 rounded-2xl border bg-card p-4 shadow-soft md:grid-cols-[auto_1fr_auto] md:items-center">
        <Button size="lg" onClick={playing ? stop : play} disabled={!parsed || busy}>
          {playing ? <><Square className="h-4 w-4" /> Stop</> : <><Play className="h-4 w-4" /> Play</>}
        </Button>
        <div className="space-y-2">
          <div className="flex justify-between text-sm"><span>Tempo</span><span className="font-semibold">♩ = {tempo}</span></div>
          <Slider min={30} max={180} step={2} value={[tempo]} onValueChange={([v]) => setTempo(v ?? 80)} disabled={locked} />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="met" checked={metronome} onCheckedChange={setMetronome} disabled={locked} />
          <Label htmlFor="met">Metronome</Label>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:col-span-3">
          {(["both", "right", "left"] as Hands[]).map((h) => (
            <Button variant={hands === h ? "secondary" : "outline"} size="sm" key={h} disabled={locked} onClick={() => setHands(h)} className="capitalize">
              {h === "both" ? "Hands together" : `${h} hand`}
            </Button>
          ))}
          <InstrumentSelect value={instrumentId} onChange={setInstrumentId} playingInstrument={activeInstrument} />
          <div className="flex flex-wrap items-center gap-2 text-sm md:ml-auto">
            <Switch id="loop" checked={loop} onCheckedChange={setLoop} disabled={locked} />
            <Label htmlFor="loop">Loop bars</Label>
            <select aria-label="First loop bar" className="rounded border bg-background px-1" value={from} disabled={locked} onChange={(e) => { const v = +e.target.value; setFrom(v); if (to < v) setTo(v); }}>
              {Array.from({ length: measureCount }, (_, i) => <option key={i}>{i + 1}</option>)}
            </select>
            –
            <select aria-label="Last loop bar" className="rounded border bg-background px-1" value={to} disabled={locked} onChange={(e) => setTo(Math.max(from, +e.target.value))}>
              {Array.from({ length: measureCount }, (_, i) => <option key={i}>{i + 1}</option>)}
            </select>
          </div>
        </div>
        <div className="md:col-span-3"><PlayAlongControls settings={along} update={updateAlong} locked={locked} /></div>
        {along.showRoll && <div className="md:col-span-3"><FallingNotes parsed={parsed} loop={loop} from={from} to={to} tempo={tempo} playing={playing} getPosition={position} settings={along} role={role} bar={current} /></div>}
        <div className="flex flex-wrap items-center gap-3 md:col-span-3">
          <Switch id="auto-scroll" checked={autoScroll} onCheckedChange={(value) => { setAutoScroll(value); if (value) { setSuspended(false); setFollowRequest((n) => n + 1); } }} />
          <Label htmlFor="auto-scroll">Auto-scroll</Label>
          {autoScroll && suspended && <Button variant="outline" size="sm" onClick={() => { setSuspended((value) => followSuspended(value, "resume")); setFollowRequest((n) => n + 1); }}><LocateFixed className="h-4 w-4" />Resume auto-scroll</Button>}
          <p role="status" className="text-sm text-muted-foreground">{current ? `Bar ${current} / ${measureCount}` : `${measureCount} bars`}</p>
        </div>
      </div>

      <div className="mt-6">{xml && <SheetMusic xml={xml} zoom={1.2} activeBar={current} follow={playing && autoScroll && !suspended} followRequest={followRequest} controlsRef={controlsRef} onManualScroll={() => { if (playing) setSuspended((value) => followSuspended(value, "manual")); }} />}</div>
      <p className="mt-4 text-xs text-muted-foreground">{piece.license}{piece.source_url && <> · <a className="underline" href={piece.source_url} target="_blank" rel="noreferrer">Source</a></>}</p>
    </>
  );
}
