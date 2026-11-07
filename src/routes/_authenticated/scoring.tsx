import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Play, Save, Cable, Square, RotateCcw, Mic } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { soundSequence } from "@/lib/audio";
import { capturePerformanceHit, performanceAccuracy, type PerformanceHit } from "@/lib/learning";
import { MicError, startMicRecording, type MicRecording } from "@/lib/mic-recorder";
import { COUNT_IN_BEATS, scorePerformance } from "@/lib/performance-scoring";
import { DEFAULT_SCORING_METHOD, SCORING_METHODS, SCORING_METHOD_STORAGE_KEY, isScoringMethodId, scoringMethodLabel, type ScoringMethodId } from "@/lib/scoring-methods";
import { pageHead } from "@/lib/head";
import { AudioComparison } from "@/components/AudioComparison";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MicLevelMeter } from "@/components/MicLevelMeter";

export const Route = createFileRoute("/_authenticated/scoring")({
  head: () => pageHead("Performance scoring — Grshwin", "Compare private audio recordings or measure note accuracy and timing with piano exercises, using MIDI input or your microphone."),
  component: Scoring,
});

const MELODY = [60, 62, 64, 65, 67, 65, 64, 60];
const KEYS = [{ midi: 60, name: "C4" }, { midi: 62, name: "D4" }, { midi: 64, name: "E4" }, { midi: 65, name: "F4" }, { midi: 67, name: "G4" }, { midi: 69, name: "A4" }, { midi: 71, name: "B4" }];
const noteName = (midi: number) => KEYS.find((k) => k.midi === midi)?.name ?? String(midi);

function noteResult(hit: PerformanceHit | null) {
  if (!hit) return "missed";
  const timing = hit.offset === 0 ? "" : ` · ${Math.abs(hit.offset)} ms ${hit.offset < 0 ? "early" : "late"}`;
  return `${hit.correct ? "correct" : "wrong note"}${timing}`;
}

function Scoring() {
  const qc = useQueryClient();
  const [method, setMethod] = useState<ScoringMethodId>(DEFAULT_SCORING_METHOD);
  const [tempo, setTempo] = useState(60);
  const [running, setRunning] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [hits, setHits] = useState<(PerformanceHit | null)[]>([]);
  const [extraNotes, setExtraNotes] = useState(0);
  const [currentNote, setCurrentNote] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [midiName, setMidiName] = useState("");
  const [problem, setProblem] = useState("");
  const [details, setDetails] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [testingMic, setTestingMic] = useState(false);
  const micTest = useRef<MicRecording | null>(null);
  const active = useRef(false);
  const startTime = useRef(0);
  const results = useRef<(PerformanceHit | null)[]>([]);
  const runId = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const midiRef = useRef<MIDIAccess | null>(null);
  const playRef = useRef<(note: number) => void>(() => {});
  const methodRef = useRef<ScoringMethodId>(DEFAULT_SCORING_METHOD);
  const recorder = useRef<MicRecording | null>(null);
  const exercise = useRef({ tempo: 60, firstClick: 0 });
  const analysisToken = useRef(0);
  const { data: history = [], isLoading, error, refetch } = useQuery({ queryKey: ["score-history"], queryFn: async () => {
    const { data, error } = await supabase.from("scores").select("*").order("created_at", { ascending: false }).limit(10);
    if (error) throw error; return data;
  } });
  const locked = running || analysing || saving || audioBusy || (finished && !saved);
  const microphone = SCORING_METHODS.find((m) => m.id === method)?.input === "microphone";

  function clearTimers() { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; }
  function resetExercise() {
    clearTimers(); active.current = false; analysisToken.current++;
    recorder.current?.cancel(); recorder.current = null;
    runId.current = null; results.current = [];
    setHits([]); setExtraNotes(0); setFinished(false); setSaved(false); setRunning(false); setAnalysing(false); setCount(null); setCurrentNote(null); setProblem("");
  }
  useEffect(() => {
    const stored = window.localStorage.getItem(SCORING_METHOD_STORAGE_KEY);
    if (isScoringMethodId(stored)) { setMethod(stored); methodRef.current = stored; }
  }, []);
  useEffect(() => () => {
    clearTimers(); active.current = false; analysisToken.current++; recorder.current?.cancel(); micTest.current?.cancel();
    if (midiRef.current) { midiRef.current.onstatechange = null; midiRef.current.inputs.forEach((i) => { i.onmidimessage = null; }); }
  }, []);
  function chooseMethod(value: string) {
    if (!isScoringMethodId(value) || locked || value === method) return;
    resetExercise(); setMethod(value); methodRef.current = value;
    window.localStorage.setItem(SCORING_METHOD_STORAGE_KEY, value);
  }

  async function analyse() {
    const rec = recorder.current; recorder.current = null;
    if (!rec) return;
    const token = ++analysisToken.current;
    setAnalysing(true); setProblem("");
    try {
      const samples = await rec.stop();
      if (token !== analysisToken.current) return;
      const { transcribe } = await import("@/lib/transcription");
      const notes = await transcribe(samples, rec.sampleRate);
      if (token !== analysisToken.current) return;
      if (!notes.length) { setProblem("No notes were detected. Check the volume and where the microphone is placed, then try again."); return; }
      // Make note times relative to the first count-in click, which is what scorePerformance expects.
      const shift = (exercise.current.firstClick - rec.startedAt) / 1000;
      const scored = scorePerformance(MELODY, exercise.current.tempo, notes.map((n) => ({ ...n, start: n.start - shift })));
      results.current = scored.hits; setHits(scored.hits); setExtraNotes(scored.extraNotes); setFinished(true);
    } catch (e) {
      console.error("Microphone analysis", e);
      if (token === analysisToken.current) { setProblem(e instanceof Error && e.message ? e.message : "The recording could not be analysed. Please try again."); setDetails(e instanceof Error && "details" in e ? String(e.details) : String(e)); }
    } finally { if (token === analysisToken.current) setAnalysing(false); }
  }
  function finish() {
    active.current = false; clearTimers(); setRunning(false); setCount(null); setCurrentNote(null);
    if (methodRef.current === "basic-pitch") { void analyse(); return; }
    setHits([...results.current]); setFinished(true);
  }
  function strike(note: number) {
    if (!active.current || methodRef.current !== "classic") return;
    const captured = capturePerformanceHit(MELODY, results.current, note, performance.now() - startTime.current, 60000 / tempo);
    if (!captured) return;
    results.current[captured.index] = captured.hit;
    setHits([...results.current]);
  }
  playRef.current = strike;
  async function start() {
    setAudioBusy(true); setProblem(""); setDetails("");
    try {
      const Tone = await import("tone"); await Tone.start();
      if (methodRef.current === "basic-pitch") {
        try { const { checkModelAssets } = await import("@/lib/transcription"); await checkModelAssets(); micTest.current?.cancel(); setTestingMic(false); recorder.current = await startMicRecording(setMicLevel); }
        catch (e) { console.error("Microphone preparation", e); setProblem(e instanceof Error ? e.message : "The microphone could not be started. Please try again."); setDetails(e instanceof Error && "details" in e ? String(e.details) : String(e)); return; }
      }
      clearTimers(); active.current = false; analysisToken.current++; runId.current = crypto.randomUUID(); results.current = Array.from({ length: MELODY.length }, () => null); setHits([...results.current]); setExtraNotes(0); setFinished(false); setCurrentNote(null); setSaved(false); setRunning(true); setCount(COUNT_IN_BEATS);
      const beat = 60000 / tempo;
      startTime.current = performance.now() + beat * COUNT_IN_BEATS;
      exercise.current = { tempo, firstClick: startTime.current - beat * COUNT_IN_BEATS };
      for (let i = 1; i <= COUNT_IN_BEATS; i++) timers.current.push(window.setTimeout(() => { setCount(i === COUNT_IN_BEATS ? null : COUNT_IN_BEATS - i); if (i === COUNT_IN_BEATS) active.current = true; }, beat * i));
      for (let i = 0; i < MELODY.length; i++) timers.current.push(window.setTimeout(() => setCurrentNote(i), beat * (COUNT_IN_BEATS + Math.max(0, i - 0.5))));
      void soundSequence(Array.from({ length: COUNT_IN_BEATS }, (_, i) => ({ midi: 76, at: i * beat / 1000, duration: 0.08 }))).catch(() => {});
      // Listening continues half a beat longer so the last note's sound is captured.
      timers.current.push(window.setTimeout(finish, beat * (COUNT_IN_BEATS + MELODY.length - (methodRef.current === "basic-pitch" ? 0 : 0.5))));
    } catch { toast.error("Audio could not start. Try again."); recorder.current?.cancel(); recorder.current = null; }
    finally { setAudioBusy(false); }
  }
  async function testMicrophone() {
    if (testingMic) { micTest.current?.cancel(); micTest.current = null; setTestingMic(false); setMicLevel(0); return; }
    setProblem(""); setDetails("");
    try { micTest.current = await startMicRecording(setMicLevel); setTestingMic(true); }
    catch (e) { console.error("Microphone test", e); setProblem(e instanceof MicError ? e.message : "The microphone could not be started."); setDetails(String(e)); }
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
    if (!finished || running || analysing || saving || saved || !runId.current) return;
    setSaving(true);
    try {
      const { data } = await supabase.auth.getUser(); if (!data.user) throw new Error("Sign in again");
      const { error } = await supabase.from("scores").upsert({ id: runId.current, user_id: data.user.id, accuracy, tempo, timing_ms: timing, correct_notes: correct, missed_notes: MELODY.length - played.length, total_notes: MELODY.length, exercise: "c-major-eight-notes", scoring_method: method, extra_notes: extraNotes }, { onConflict: "id", ignoreDuplicates: true }); if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["score-history"] }); setSaved(true); toast.success("Performance saved");
    } catch { toast.error("Couldn't save this performance. Please try again."); }
    finally { setSaving(false); }
  }
  return <>
    <PageHeader title="Performance scoring" subtitle="Recordings & piano exercises" />
    <Tabs defaultValue="audio"><TabsList><TabsTrigger value="audio">Audio comparison</TabsTrigger><TabsTrigger value="exercise">Piano & MIDI</TabsTrigger></TabsList><TabsContent value="audio"><AudioComparison /></TabsContent><TabsContent value="exercise">
    {!microphone && <div className="my-4 flex justify-end"><Button variant="outline" onClick={connect}><Cable className="h-4 w-4" />Connect MIDI</Button></div>}
    <RadioGroup aria-label="Scoring method" value={method} onValueChange={chooseMethod} disabled={locked} className="mb-6 grid gap-3 sm:grid-cols-2">
      {SCORING_METHODS.map((m) => <Label key={m.id} htmlFor={`method-${m.id}`} className={`flex items-start gap-3 rounded-md border p-4 font-normal ${method === m.id ? "border-primary bg-secondary" : ""} ${locked ? "opacity-70" : "cursor-pointer"}`}>
        <RadioGroupItem id={`method-${m.id}`} value={m.id} disabled={locked} className="mt-1" />
        <span><span className="block font-semibold">{m.label}</span><span className="block text-sm text-muted-foreground">{m.description}</span></span>
      </Label>)}
    </RadioGroup>
    {!microphone && midiName && <p role="status" className="mb-4 text-sm text-muted-foreground">{midiName}</p>}
    {microphone && <p className="mb-4 flex items-start gap-2 text-sm text-muted-foreground"><Mic className="mt-0.5 h-4 w-4 shrink-0" />Your browser will ask to use the microphone when you press Start. Use headphones or keep the count-in quiet so the clicks are not picked up, and play each note as the highlighted beat arrives.</p>}
    {microphone && <><Button variant="outline" disabled={running || analysing || audioBusy} onClick={testMicrophone}><Mic className="h-4 w-4" />{testingMic ? "Stop microphone test" : "Test microphone"}</Button>{(testingMic || running) && <MicLevelMeter level={micLevel} />}</>}
    <div className="flex flex-wrap items-center gap-6 border-y py-4"><Button disabled={audioBusy || saving || analysing} onClick={running ? finish : start}>{running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}{running ? "Stop" : problem && microphone ? "Try again" : "Start exercise"}</Button><div className="min-w-40 max-w-xs flex-1 space-y-2"><p className="text-sm">Tempo · ♩ = {tempo}</p><Slider aria-label="Exercise tempo" min={40} max={120} step={5} value={[tempo]} disabled={locked} onValueChange={([v]) => setTempo(v ?? 60)} /></div></div>
    <div className="mt-8 grid grid-cols-8 gap-1" aria-label="Exercise notes">{MELODY.map((n, i) => <div key={i} className={`flex h-20 flex-col items-center justify-center gap-2 rounded-md border ${hits[i] ? hits[i]?.correct ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive" : running && currentNote === i ? "border-primary bg-secondary" : finished || (currentNote !== null && i < currentNote) ? "bg-muted text-muted-foreground" : "bg-card"}`}><span className="text-xs text-muted-foreground">{i + 1}</span><span className="font-display text-xl">{noteName(n).replace("4", "")}</span></div>)}</div>
    <p role="status" className="my-5 min-h-7 text-center font-semibold">{count !== null ? `Count in: ${count}` : running ? `${(currentNote ?? 0) + 1} / 8${microphone ? " · listening" : ""}` : analysing ? "Analysing your recording…" : finished ? "Exercise finished" : "Ready"}</p>
    {problem && <p role="alert" className="mb-5 text-center text-destructive">{problem}</p>}
    {problem && details && <details className="mb-5 break-words text-sm text-muted-foreground"><summary>Technical details</summary>{details}</details>}
    {!microphone && <div className="mx-auto grid max-w-xl grid-cols-7 gap-1" aria-label="Piano">{KEYS.map((k) => <Button key={k.midi} variant="outline" className="h-32 items-end pb-4 text-base" aria-label={`Play ${k.name}`} disabled={!running || count !== null} onClick={() => { strike(k.midi); void soundSequence([{ midi: k.midi, at: 0, duration: 0.15 }]).catch(() => {}); }}>{k.name}</Button>)}</div>}
    {!running && !analysing && finished && <section className="mt-8 space-y-6 border-y py-6">
      <div className="flex flex-wrap items-center justify-between gap-6"><div><p className="font-display text-3xl">{accuracy}%</p><p className="text-sm text-muted-foreground">{correct} of 8 notes correct · {8 - played.length} missed{microphone && ` · ${extraNotes} extra`}</p></div><div><p className="font-display text-3xl">{timing === null ? "—" : `${timing} ms`}</p><p className="text-sm text-muted-foreground">Average timing deviation</p></div><div><p className="font-display text-xl">{scoringMethodLabel(method)}</p><p className="text-sm text-muted-foreground">Scoring method</p></div><Button onClick={save} disabled={saving || saved}><Save className="h-4 w-4" />{saved ? "Saved" : saving ? "Saving…" : "Save result"}</Button></div>
      <ul aria-label="Per-note results" className="grid gap-1 text-sm sm:grid-cols-2">{MELODY.map((n, i) => <li key={i} className={hits[i] ? hits[i]?.correct ? "" : "text-destructive" : "text-muted-foreground"}>{i + 1}. {noteName(n)} — {noteResult(hits[i] ?? null)}</li>)}</ul>
    </section>}
    <h2 className="mt-8 font-display text-2xl">Recent performances</h2>
    {isLoading ? <p role="status" className="mt-4 text-muted-foreground">Loading performances…</p> : error ? <div className="mt-4 flex flex-wrap items-center gap-3"><p role="alert" className="text-destructive">Saved performances could not be loaded.</p><Button variant="outline" onClick={() => refetch()}><RotateCcw className="h-4 w-4" />Retry</Button></div> : history.length ? <ul className="mt-4 divide-y">{history.map((h) => <li key={h.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span>{new Date(h.created_at).toLocaleDateString()} · {h.tempo} BPM{h.exercise && " · C major exercise"} · {scoringMethodLabel(h.scoring_method)}</span><span className="font-semibold">{h.accuracy}% note accuracy{h.timing_ms !== null && ` · ${h.timing_ms} ms`}{h.missed_notes !== null && ` · ${h.missed_notes} missed`}{h.extra_notes ? ` · ${h.extra_notes} extra` : ""}</span></li>)}</ul> : <p className="mt-4 text-muted-foreground">No saved performances yet.</p>}
    </TabsContent></Tabs>
  </>;
}
