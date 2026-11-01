import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Play, Save, Cable, Square, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { soundSequence } from "@/lib/audio";
import { capturePerformanceHit, performanceAccuracy, type PerformanceHit } from "@/lib/learning";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/scoring")({
  head: () => pageHead("Performance scoring — Grshwin", "Measure note accuracy and timing with a piano exercise and optional MIDI input."),
  component: Scoring,
});

const MELODY = [60, 62, 64, 65, 67, 65, 64, 60];
const KEYS = [{ midi: 60, name: "C4" }, { midi: 62, name: "D4" }, { midi: 64, name: "E4" }, { midi: 65, name: "F4" }, { midi: 67, name: "G4" }, { midi: 69, name: "A4" }, { midi: 71, name: "B4" }];

function Scoring() {
  const qc = useQueryClient();
  const [tempo, setTempo] = useState(60);
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [hits, setHits] = useState<(PerformanceHit | null)[]>([]);
  const [currentNote, setCurrentNote] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [midiName, setMidiName] = useState("");
  const active = useRef(false);
  const startTime = useRef(0);
  const results = useRef<(PerformanceHit | null)[]>([]);
  const runId = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const midiRef = useRef<MIDIAccess | null>(null);
  const playRef = useRef<(note: number) => void>(() => {});
  const { data: history = [], isLoading, error, refetch } = useQuery({ queryKey: ["score-history"], queryFn: async () => {
    const { data, error } = await supabase.from("scores").select("*").order("created_at", { ascending: false }).limit(10);
    if (error) throw error; return data;
  } });
  function clearTimers() { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; }
  useEffect(() => () => { clearTimers(); active.current = false; if (midiRef.current) { midiRef.current.onstatechange = null; midiRef.current.inputs.forEach((i) => { i.onmidimessage = null; }); } }, []);
  function finish() { active.current = false; clearTimers(); setRunning(false); setCount(null); setCurrentNote(null); setHits([...results.current]); setFinished(true); }
  function strike(note: number) {
    if (!active.current) return;
    const captured = capturePerformanceHit(MELODY, results.current, note, performance.now() - startTime.current, 60000 / tempo);
    if (!captured) return;
    results.current[captured.index] = captured.hit;
    setHits([...results.current]);
  }
  playRef.current = strike;
  async function start() {
    setAudioBusy(true);
    try {
      const Tone = await import("tone"); await Tone.start();
      clearTimers(); active.current = false; runId.current = crypto.randomUUID(); results.current = Array.from({ length: MELODY.length }, () => null); setHits([...results.current]); setFinished(false); setCurrentNote(null); setSaved(false); setRunning(true); setCount(4);
      const beat = 60000 / tempo;
      startTime.current = performance.now() + beat * 4;
      for (let i = 1; i <= 4; i++) timers.current.push(window.setTimeout(() => { setCount(i === 4 ? null : 4 - i); if (i === 4) active.current = true; }, beat * i));
      for (let i = 0; i < MELODY.length; i++) timers.current.push(window.setTimeout(() => setCurrentNote(i), beat * (4 + Math.max(0, i - 0.5))));
      void soundSequence(Array.from({ length: 4 }, (_, i) => ({ midi: 76, at: i * beat / 1000, duration: 0.08 }))).catch(() => {});
      timers.current.push(window.setTimeout(finish, beat * (4 + MELODY.length - 0.5)));
    } catch { toast.error("Audio could not start. Try again."); }
    finally { setAudioBusy(false); }
  }
  async function connect() {
    if (!navigator.requestMIDIAccess) { toast.error("MIDI is unavailable in this browser. Use the piano keys below."); return; }
    try {
      const access = await navigator.requestMIDIAccess(); midiRef.current = access;
      const bind = () => {
        setMidiName([...access.inputs.values()].map((i) => i.name || "MIDI piano").join(", ") || "No MIDI piano connected");
        access.inputs.forEach((input) => { input.onmidimessage = (e) => {
          if (!e.data) return;
          const [status = 0, note = 0, velocity = 0] = e.data;
          if ((status & 0xf0) === 0x90 && velocity > 0) playRef.current(note);
        }; });
      }; bind(); access.onstatechange = bind;
    } catch { toast.error("MIDI permission was not granted. You can still use the on-screen piano."); }
  }
  const played = hits.filter((h): h is PerformanceHit => h !== null);
  const correct = played.filter((h) => h.correct).length;
  const accuracy = performanceAccuracy(correct, MELODY.length);
  const timing = played.length ? Math.round(played.reduce((sum, h) => sum + Math.abs(h.offset), 0) / played.length) : null;
  async function save() {
    if (!finished || running || saving || saved || !runId.current) return;
    setSaving(true);
    try {
      const { data } = await supabase.auth.getUser(); if (!data.user) throw new Error("Sign in again");
      const { error } = await supabase.from("scores").upsert({ id: runId.current, user_id: data.user.id, accuracy, tempo, timing_ms: timing, correct_notes: correct, missed_notes: MELODY.length - played.length, total_notes: MELODY.length, exercise: "c-major-eight-notes" }, { onConflict: "id", ignoreDuplicates: true }); if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["score-history"] }); setSaved(true); toast.success("Performance saved");
    } catch { toast.error("Couldn't save this performance. Please try again."); }
    finally { setSaving(false); }
  }
  return <>
    <PageHeader title="Performance scoring" subtitle="C major · eight-note accuracy & timing exercise"><Button variant="outline" onClick={connect}><Cable className="h-4 w-4" />Connect MIDI</Button></PageHeader>
    {midiName && <p role="status" className="mb-4 text-sm text-muted-foreground">{midiName}</p>}
    <div className="flex flex-wrap items-center gap-6 border-y py-4"><Button disabled={audioBusy || saving} onClick={running ? finish : start}>{running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}{running ? "Stop" : "Start exercise"}</Button><div className="min-w-40 max-w-xs flex-1 space-y-2"><p className="text-sm">Tempo · ♩ = {tempo}</p><Slider aria-label="Exercise tempo" min={40} max={120} step={5} value={[tempo]} disabled={running || saving || (finished && !saved)} onValueChange={([v]) => setTempo(v ?? 60)} /></div></div>
    <div className="mt-8 grid grid-cols-8 gap-1" aria-label="Exercise notes">{MELODY.map((n, i) => <div key={i} className={`flex h-20 flex-col items-center justify-center gap-2 rounded-md border ${hits[i] ? hits[i]?.correct ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive" : running && currentNote === i ? "border-primary bg-secondary" : finished || (currentNote !== null && i < currentNote) ? "bg-muted text-muted-foreground" : "bg-card"}`}><span className="text-xs text-muted-foreground">{i + 1}</span><span className="font-display text-xl">{KEYS.find((k) => k.midi === n)?.name.replace("4", "")}</span></div>)}</div>
    <p role="status" className="my-5 min-h-7 text-center font-semibold">{count !== null ? `Count in: ${count}` : running ? `${(currentNote ?? 0) + 1} / 8` : finished ? "Exercise finished" : "Ready"}</p>
    <div className="mx-auto grid max-w-xl grid-cols-7 gap-1" aria-label="Piano">{KEYS.map((k) => <Button key={k.midi} variant="outline" className="h-32 items-end pb-4 text-base" aria-label={`Play ${k.name}`} disabled={!running || count !== null} onClick={() => { strike(k.midi); void soundSequence([{ midi: k.midi, at: 0, duration: 0.15 }]).catch(() => {}); }}>{k.name}</Button>)}</div>
    {!running && finished && <section className="mt-8 flex flex-wrap items-center justify-between gap-6 border-y py-6"><div><p className="font-display text-3xl">{accuracy}%</p><p className="text-sm text-muted-foreground">{correct} of 8 notes correct · {8 - played.length} missed</p></div><div><p className="font-display text-3xl">{timing === null ? "—" : `${timing} ms`}</p><p className="text-sm text-muted-foreground">Average timing deviation</p></div><Button onClick={save} disabled={saving || saved}><Save className="h-4 w-4" />{saved ? "Saved" : saving ? "Saving…" : "Save result"}</Button></section>}
    <h2 className="mt-8 font-display text-2xl">Recent performances</h2>
    {isLoading ? <p role="status" className="mt-4 text-muted-foreground">Loading performances…</p> : error ? <div className="mt-4 flex flex-wrap items-center gap-3"><p role="alert" className="text-destructive">Saved performances could not be loaded.</p><Button variant="outline" onClick={() => refetch()}><RotateCcw className="h-4 w-4" />Retry</Button></div> : history.length ? <ul className="mt-4 divide-y">{history.map((h) => <li key={h.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span>{new Date(h.created_at).toLocaleDateString()} · {h.tempo} BPM{h.exercise && " · C major exercise"}</span><span className="font-semibold">{h.accuracy}% note accuracy{h.timing_ms !== null && ` · ${h.timing_ms} ms`}{h.missed_notes !== null && ` · ${h.missed_notes} missed`}</span></li>)}</ul> : <p className="mt-4 text-muted-foreground">No saved performances yet.</p>}
  </>;
}
