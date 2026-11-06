import { pageHead } from "@/lib/head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { generateCurriculum } from "@/lib/curriculum.functions";
import { latestPlanQuery, piecesQuery, profileQuery, sessionsQuery, todayIndex } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/curriculum")({
  head: () => pageHead("Weekly plan — Grshwin", "Your personalised weekly practice plan."),
  component: Curriculum,
});

function Curriculum() {
  const qc = useQueryClient();
  const gen = useServerFn(generateCurriculum);
  const { data: plan, isLoading } = useQuery(latestPlanQuery);
  const { data: pieces = [] } = useQuery(piecesQuery);
  const { data: profile } = useQuery(profileQuery);
  const { data: sessions = [] } = useQuery(sessionsQuery);
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState(0);

  useEffect(() => { if (plan) setDay(todayIndex(plan.week_start)); }, [plan?.id]);

  async function create() {
    setBusy(true);
    try {
      await gen();
      await qc.invalidateQueries({ queryKey: ["plan"] });
      toast.success("Your new week is ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create a plan");
    }
    setBusy(false);
  }

  const GenButton = (
    <Button onClick={create} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {busy ? "Composing your week…" : plan ? "New week" : "Create my weekly plan"}
    </Button>
  );

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!plan) return (<><PageHeader title="Weekly plan" subtitle="Built around your level, genre and goals." />{GenButton}</>);

  const d = plan.plan.days[day];
  const piece = pieces.find((p) => p.id === d?.pieceId);
  const session = sessions.find((s) => s.plan_id === plan.id && s.day_index === day);

  return (
    <>
      <PageHeader title="Weekly plan" subtitle={plan.plan.weekTheme}>{GenButton}</PageHeader>
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {plan.plan.days.map((x, i) => {
          const done = sessions.some((s) => s.plan_id === plan.id && s.day_index === i && s.minutes > 0);
          return (
            <button key={i} onClick={() => setDay(i)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm", day === i && "border-primary bg-accent text-accent-foreground", done && "font-semibold")}>
              {x.day}{done ? " ✓" : ""}
            </button>
          );
        })}
      </div>
      {d && (
        <div className="grid gap-4 md:grid-cols-2">
          <p className="text-lg md:col-span-2">{d.focus}</p>
          <Card title="Warm-up"><p className="font-semibold">{d.warmup.title}</p><p className="mt-1 text-sm text-muted-foreground">{d.warmup.details}</p></Card>
          <Card title="Technical drills">
            <ul className="space-y-3">{d.drills.map((x, i) => <li key={i}><p className="font-semibold">{x.title}</p><p className="text-sm text-muted-foreground">{x.details}</p></li>)}</ul>
          </Card>
          <Card title="Repertoire" className="md:col-span-2">
            {piece && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-display text-xl">{piece.title}</p><p className="text-sm text-muted-foreground">{piece.composer}</p></div>
                <Button asChild variant="outline"><Link to="/piece/$id" params={{ id: piece.id }}>Open player</Link></Button>
              </div>
            )}
            <ol className="space-y-2">
              {d.practiceSteps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{i + 1}</span>
                  <span className="flex-1">{s.step}</span>
                  {s.tempo && s.tempo !== "—" && <span className="shrink-0 font-semibold text-primary">{s.tempo}</span>}
                </li>
              ))}
            </ol>
          </Card>
          <SessionLog key={`${plan.id}-${day}`} planId={plan.id} dayIndex={day} checklist={d.checklist} defaultMinutes={profile?.daily_minutes ?? 30} session={session} />
        </div>
      )}
    </>
  );
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5", className)}>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">{title}</h3>
      {children}
    </section>
  );
}

function SessionLog({ planId, dayIndex, checklist, defaultMinutes, session }: {
  planId: string; dayIndex: number; checklist: string[]; defaultMinutes: number;
  session: { completed_items: unknown; minutes: number; hard_note: string | null } | undefined;
}) {
  const qc = useQueryClient();
  const [done, setDone] = useState<string[]>((session?.completed_items as string[]) ?? []);
  const [minutes, setMinutes] = useState(session?.minutes || defaultMinutes);
  const [note, setNote] = useState(session?.hard_note ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("practice_sessions").upsert(
      { user_id: u.user!.id, plan_id: planId, day_index: dayIndex, completed_items: done, minutes, hard_note: note, session_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() },
      { onConflict: "plan_id,day_index" },
    );
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Session saved");
    qc.invalidateQueries({ queryKey: ["sessions"] });
  }

  return (
    <Card title="Checklist" className="md:col-span-2">
      <div className="space-y-2">
        {checklist.map((c) => (
          <label key={c} className="flex items-center gap-3 text-sm">
            <Checkbox checked={done.includes(c)} onCheckedChange={(v) => setDone(v ? [...done, c] : done.filter((x) => x !== c))} />
            <span className={cn(done.includes(c) && "text-muted-foreground line-through")}>{c}</span>
          </label>
        ))}
      </div>
      <Textarea className="mt-4" placeholder="What was hard today?" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="mt-4 flex items-center gap-3">
        <Input type="number" min={0} className="w-24" value={minutes} onChange={(e) => setMinutes(+e.target.value)} />
        <span className="text-sm text-muted-foreground">minutes practiced</span>
        <Button className="ml-auto" onClick={save} disabled={saving}>Save session</Button>
      </div>
    </Card>
  );
}
