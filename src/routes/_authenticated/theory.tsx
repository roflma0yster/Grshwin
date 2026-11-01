import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, ArrowRight, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { LearningProgress } from "@/components/LearningProgress";
import { supabase } from "@/integrations/supabase/client";
import { LESSONS } from "@/lib/learning";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/theory")({
  head: () => pageHead("Theory — Grshwin", "Study key signatures, intervals, chords and rhythm with short piano lessons."),
  component: Theory,
});

function Theory() {
  const qc = useQueryClient();
  const [active, setActive] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: progress = [], isLoading, error, refetch } = useQuery({ queryKey: ["theory-progress"], queryFn: async () => {
    const { data, error } = await supabase.from("theory_progress").select("*");
    if (error) throw error;
    return data;
  } });
  const lesson = LESSONS[active];
  if (!lesson) return null;
  const completed = new Set(progress.filter((p) => p.completed).map((p) => p.topic));
  async function complete() {
    if (!lesson || answer !== lesson.answer || saving || error || completed.has(lesson.id)) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");
      const result = await supabase.from("theory_progress").upsert({ user_id: auth.user.id, topic: lesson.id, completed: true }, { onConflict: "user_id,topic" });
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: ["theory-progress"] });
      toast.success("Lesson completed");
    } catch { toast.error("Couldn't save your progress. Try again."); }
    finally { setSaving(false); }
  }
  return <>
    <PageHeader title="Theory" subtitle="A little understanding. A more musical practice." />
    <LearningProgress value={completed.size / LESSONS.length * 100} label={`${completed.size} of ${LESSONS.length} lessons completed`} />
    {isLoading && <p role="status" className="mb-4 text-muted-foreground">Loading progress…</p>}
    {error && <div className="mb-4 flex flex-wrap items-center gap-3"><p role="alert" className="text-destructive">Your saved progress could not be loaded.</p><Button variant="outline" onClick={() => refetch()}>Retry</Button></div>}
    <div className="grid gap-8 md:grid-cols-[220px_1fr]">
      <nav aria-label="Theory lessons" className="flex flex-col gap-2">{LESSONS.map((l, i) => <Button key={l.id} variant={i === active ? "secondary" : "ghost"} onClick={() => { setActive(i); setAnswer(null); }} className="h-auto justify-start gap-3 whitespace-normal py-3 text-left"><span className="text-primary">{completed.has(l.id) ? <Check className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}</span><span>{l.title}</span></Button>)}</nav>
      <article className="min-w-0">
        <p className="mb-2 text-xs uppercase tracking-widest text-primary">Lesson {active + 1}</p>
        <h2 className="font-display text-3xl">{lesson.title}</h2>
        <p className="mt-1 text-muted-foreground">{lesson.summary}</p>
        <div className="my-6 space-y-4 leading-relaxed">{lesson.paragraphs.map((p) => <p key={p}>{p}</p>)}</div>
        <section className="border-t pt-6">
          <h3 className="font-semibold">{lesson.question}</h3>
          <div className="my-4 grid gap-2 sm:grid-cols-2">{lesson.choices.map((c, i) => <Button key={c} variant={answer === i ? "secondary" : "outline"} className="h-auto justify-start whitespace-normal py-3" onClick={() => setAnswer(i)}>{c}</Button>)}</div>
          {answer !== null && <p role="status" className="mb-4 text-sm text-muted-foreground">{answer === lesson.answer ? `Correct. ${lesson.explanation}` : "Not quite. Revisit the lesson and try another answer."}</p>}
          <div className="flex flex-wrap gap-2"><Button onClick={complete} disabled={answer !== lesson.answer || saving || isLoading || !!error || completed.has(lesson.id)}><Check className="h-4 w-4" />{completed.has(lesson.id) ? "Completed" : saving ? "Saving…" : "Complete lesson"}</Button>{active < LESSONS.length - 1 && <Button variant="ghost" disabled={saving} onClick={() => { setActive(active + 1); setAnswer(null); }}>Next lesson<ArrowRight className="h-4 w-4" /></Button>}</div>
        </section>
      </article>
    </div>
  </>;
}
