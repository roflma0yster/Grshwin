import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Play, RotateCcw, ArrowRight, Ear } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CHORDS, INTERVALS, RHYTHMS, performanceAccuracy } from "@/lib/learning";
import { soundSequence } from "@/lib/audio";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/ear-training")({
  head: () => pageHead("Ear training — KeyCoach", "Practise recognising musical intervals, chords and rhythms by ear."),
  component: EarTraining,
});

type Mode = "Intervals" | "Chords" | "Rhythm";
function EarTraining() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("Intervals");
  const [target, setTarget] = useState<number | null>(null);
  const [root, setRoot] = useState(60);
  const [answer, setAnswer] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: history = [] } = useQuery({ queryKey: ["ear-progress"], queryFn: async () => {
    const { data, error } = await supabase.from("ear_training_progress").select("*");
    if (error) throw error; return data;
  } });
  const options = mode === "Intervals" ? INTERVALS : mode === "Chords" ? CHORDS : RHYTHMS;
  const rows = history.filter((h) => h.exercise === mode);
  const attempts = rows.reduce((sum, h) => sum + h.attempts, 0);
  const correct = rows.reduce((sum, h) => sum + h.correct, 0);
  async function listen(fresh = false) {
    const index = fresh || target === null ? Math.floor(Math.random() * options.length) : target;
    const base = fresh || target === null ? 57 + Math.floor(Math.random() * 8) : root;
    if (fresh || target === null) { setTarget(index); setRoot(base); setAnswer(null); }
    setPlaying(true);
    try {
      const interval = INTERVALS[index]; const chord = CHORDS[index]; const rhythm = RHYTHMS[index];
      if (mode === "Intervals" && interval) await soundSequence([{ midi: base, at: 0 }, { midi: base + interval.semitones, at: 0.6 }]);
      if (mode === "Chords" && chord) await soundSequence(chord.offsets.map((n) => ({ midi: base + n, at: 0, duration: 1 })));
      if (mode === "Rhythm" && rhythm) await soundSequence(rhythm.beats.map((b) => ({ midi: 76, at: b * 0.6, duration: 0.08 })));
    } catch { toast.error("Audio could not start. Press Listen to try again."); }
    finally { setPlaying(false); }
  }
  async function choose(index: number) {
    if (answer !== null || target === null) return;
    setAnswer(index); setSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Sign in again");
      const { error } = await supabase.from("ear_training_progress").insert({ user_id: data.user.id, exercise: mode, attempts: 1, correct: index === target ? 1 : 0 });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["ear-progress"] });
    } catch { toast.error("Your answer wasn't saved. Please try another exercise."); }
    finally { setSaving(false); }
  }
  return <>
    <PageHeader title="Ear training" subtitle="Listen closely. Trust your ear." />
    <div className="mb-8 flex flex-wrap gap-2">{(["Intervals", "Chords", "Rhythm"] as Mode[]).map((m) => <Button key={m} variant={mode === m ? "secondary" : "ghost"} disabled={playing || saving} onClick={() => { setMode(m); setTarget(null); setAnswer(null); }}>{m}</Button>)}</div>
    <div className="flex items-center gap-3 border-b pb-6"><Ear className="h-6 w-6 text-primary" /><p className="text-sm text-muted-foreground">{attempts ? `${correct} correct / ${attempts} attempts · ${performanceAccuracy(correct, attempts)}%` : "No attempts yet"}</p></div>
    <section className="mx-auto max-w-xl py-10 text-center">
      <h2 className="font-display text-3xl">{mode === "Intervals" ? "What interval do you hear?" : mode === "Chords" ? "What chord do you hear?" : "Which rhythm do you hear?"}</h2>
      <Button size="lg" className="my-8" onClick={() => listen()} disabled={playing || saving}>{target === null ? <Play className="h-5 w-5" /> : <RotateCcw className="h-5 w-5" />}{playing ? "Playing…" : target === null ? "Listen" : "Listen again"}</Button>
      <div className="grid gap-3 sm:grid-cols-2">{options.map((o, i) => <Button key={o.label} variant={answer === i ? "secondary" : "outline"} className="h-12 text-base" onClick={() => choose(i)} disabled={target === null || playing || answer !== null}>{o.label}</Button>)}</div>
      {answer !== null && <div className="mt-6"><p role="status" className="font-semibold">{answer === target ? "Correct — well heard!" : `The answer was ${options[target ?? 0]?.label}.`}</p><Button variant="ghost" className="mt-4" disabled={playing || saving} onClick={() => listen(true)}>Next exercise<ArrowRight className="h-4 w-4" /></Button></div>}
    </section>
  </>;
}
