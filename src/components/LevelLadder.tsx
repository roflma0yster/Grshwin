import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Cable, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { soundSequence } from "@/lib/audio";
import { LADDER_STOP_ACCURACY, LEVEL_EXERCISES, beatMs } from "@/lib/level-exercises";
import { capturePerformanceHit, performanceAccuracy, type PerformanceHit } from "@/lib/learning";
import { recordExerciseResult } from "@/lib/rating.functions";
import { COUNT_IN_BEATS } from "@/lib/performance-scoring";

const KEYS = [{ midi: 60, name: "C4" }, { midi: 62, name: "D4" }, { midi: 64, name: "E4" }, { midi: 65, name: "F4" }, { midi: 67, name: "G4" }, { midi: 69, name: "A4" }, { midi: 71, name: "B4" }];
const noteName = (midi: number) => KEYS.find((k) => k.midi === midi)?.name.replace("4", "") ?? "";

type Summary = { accuracy: number; timing: number | null; rating: number; delta: number; level: string };

/** A short ladder of graded exercises, played on the on-screen piano or a MIDI keyboard (Classic scoring). */
export function LevelLadder({ onRated }: { onRated: () => void }) {
  const record = useServerFn(recordExerciseResult);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "saving" | "result" | "finished">("idle");
  const [count, setCount] = useState<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [hits, setHits] = useState<(PerformanceHit | null)[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [midiName, setMidiName] = useState("");
  const [problem, setProblem] = useState("");
  const exercise = LEVEL_EXERCISES[index]!;
  const active = useRef(false);
  const startTime = useRef(0);
  const results = useRef<(PerformanceHit | null)[]>([]);
  const timers = useRef<number[]>([]);
  const runId = useRef(crypto.randomUUID());
  const midi = useRef<MIDIAccess | null>(null);
  const strikeRef = useRef<(note: number) => void>(() => {});
  const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => () => { clear(); active.current = false; if (midi.current) { midi.current.onstatechange = null; midi.current.inputs.forEach((i) => { i.onmidimessage = null; }); } }, []);

  function strike(note: number) {
    if (!active.current) return;
    const captured = capturePerformanceHit(exercise.melody, results.current, note, performance.now() - startTime.current, beatMs(exercise.tempo));
    if (!captured) return;
    results.current[captured.index] = captured.hit;
    setHits([...results.current]);
  }
  strikeRef.current = strike;

  async function finishExercise() {
    active.current = false; clear(); setCount(null); setCurrent(null); setPhase("saving");
    const played = results.current.filter((h): h is PerformanceHit => h !== null);
    const accuracy = performanceAccuracy(played.filter((h) => h.correct).length, exercise.melody.length);
    const timing = played.length ? Math.round(played.reduce((s, h) => s + Math.abs(h.offset), 0) / played.length) : null;
    try {
      const r = await record({ data: { runId: runId.current, exerciseId: exercise.id, accuracy, timingMs: timing } });
      setSummary({ accuracy, timing, rating: r.rating, delta: r.delta, level: r.level });
      setPhase(accuracy < LADDER_STOP_ACCURACY || index === LEVEL_EXERCISES.length - 1 ? "finished" : "result");
      onRated();
    } catch { setProblem("Your result could not be saved. Try this exercise again."); setPhase("idle"); }
  }
  async function start() {
    setProblem("");
    try {
      const Tone = await import("tone"); await Tone.start();
      clear(); results.current = exercise.melody.map(() => null); setHits([...results.current]); setSummary(null); setPhase("running"); setCount(COUNT_IN_BEATS);
      const beat = beatMs(exercise.tempo);
      startTime.current = performance.now() + beat * COUNT_IN_BEATS;
      for (let i = 1; i <= COUNT_IN_BEATS; i++) timers.current.push(window.setTimeout(() => { setCount(i === COUNT_IN_BEATS ? null : COUNT_IN_BEATS - i); if (i === COUNT_IN_BEATS) active.current = true; }, beat * i));
      for (let i = 0; i < exercise.melody.length; i++) timers.current.push(window.setTimeout(() => setCurrent(i), beat * (COUNT_IN_BEATS + Math.max(0, i - 0.5))));
      void soundSequence(Array.from({ length: COUNT_IN_BEATS }, (_, i) => ({ midi: 76, at: (i * beat) / 1000, duration: 0.08 }))).catch(() => {});
      timers.current.push(window.setTimeout(() => void finishExercise(), beat * (COUNT_IN_BEATS + exercise.melody.length - 0.5)));
    } catch { toast.error("Audio could not start. Try again."); setPhase("idle"); }
  }
  async function connect() {
    if (!navigator.requestMIDIAccess) { toast.error("MIDI is unavailable in this browser. Use the piano keys below."); return; }
    try {
      const access = await navigator.requestMIDIAccess(); midi.current = access;
      const bind = () => {
        setMidiName([...access.inputs.values()].map((i) => i.name || "MIDI piano").join(", ") || "No MIDI piano connected");
        access.inputs.forEach((input) => { input.onmidimessage = (e) => { if (!e.data) return; const [status = 0, note = 0, velocity = 0] = e.data; if ((status & 0xf0) === 0x90 && velocity > 0) strikeRef.current(note); }; });
      }; bind(); access.onstatechange = bind;
    } catch { toast.error("MIDI permission was not granted. You can still use the on-screen piano."); }
  }
  function next() { setIndex((i) => i + 1); setPhase("idle"); setSummary(null); setHits([]); }
  function restart() { runId.current = crypto.randomUUID(); setIndex(0); setPhase("idle"); setSummary(null); setHits([]); }

  const busy = phase === "running" || phase === "saving";
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">Exercise {index + 1} of {LEVEL_EXERCISES.length}: {exercise.name} <span className="font-normal text-muted-foreground">· ♩ = {exercise.tempo}</span></p>
        <Button variant="outline" size="sm" onClick={connect} disabled={busy}><Cable className="h-4 w-4" />Connect MIDI</Button>
      </div>
      {midiName && <p role="status" className="mt-1 text-sm text-muted-foreground">{midiName}</p>}
      <div className="mt-4 flex gap-1 overflow-x-auto" aria-label="Exercise notes">{exercise.melody.map((n, i) => <div key={i} className={`flex h-14 min-w-10 flex-1 flex-col items-center justify-center rounded-md border text-sm ${hits[i] ? hits[i]?.correct ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive" : phase === "running" && current === i ? "border-primary bg-secondary" : "bg-card"}`}><span className="text-[10px] text-muted-foreground">{i + 1}</span><span className="font-display">{noteName(n)}</span></div>)}</div>
      <p role="status" className="my-3 min-h-6 text-center text-sm font-semibold">{count !== null ? `Count in: ${count}` : phase === "running" ? "Play along" : phase === "saving" ? "Saving…" : ""}</p>
      {problem && <p role="alert" className="mb-3 text-center text-destructive">{problem}</p>}
      <div className="mx-auto grid max-w-xl grid-cols-7 gap-1" aria-label="Piano">{KEYS.map((k) => <Button key={k.midi} variant="outline" className="h-20 items-end pb-2" aria-label={`Play ${k.name}`} disabled={phase !== "running" || count !== null} onClick={() => { strike(k.midi); void soundSequence([{ midi: k.midi, at: 0, duration: 0.15 }]).catch(() => {}); }}>{k.name}</Button>)}</div>
      {summary && <div className="mt-4 rounded-xl border p-4 text-sm" role="status"><p><span className="font-semibold">{summary.accuracy}%</span> of notes correct{summary.timing !== null && ` · ${summary.timing} ms average timing`}. Your level is now about <span className="font-semibold">{Math.round(summary.rating / 10) * 10}</span> ({summary.level}){summary.delta !== 0 && `, ${summary.delta > 0 ? "up" : "down"} ${Math.abs(summary.delta)}`}.</p>{phase === "finished" && <p className="mt-1 text-muted-foreground">{summary.accuracy < LADDER_STOP_ACCURACY ? "That exercise was a stretch, so we've found your range for now." : "You completed every exercise."}</p>}</div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {(phase === "idle" || phase === "running") && <Button onClick={start} disabled={phase === "running"}><Play className="h-4 w-4" />{index === 0 && !hits.length ? "Start the ladder" : "Start this exercise"}</Button>}
        {phase === "result" && <Button onClick={next}>Next exercise</Button>}
        {phase === "finished" && <Button variant="outline" onClick={restart}>Start again</Button>}
      </div>
    </div>
  );
}
