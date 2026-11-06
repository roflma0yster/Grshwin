import { pageHead } from "@/lib/head";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { LevelLadder } from "@/components/LevelLadder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { piecesQuery } from "@/lib/data";
import { LEVEL_BANDS, describeRating, ratingToLevel } from "@/lib/rating";
import { getLevel, recordSelfReport } from "@/lib/rating.functions";
import { SKILL_HAVE_LEVEL } from "@/lib/skills";

export const Route = createFileRoute("/_authenticated/level")({
  head: () => pageHead("Your level — Grshwin", "Your piano level rating, built from the songs you play and your scored playing."),
  component: LevelPage,
});

type Custom = { title: string; composer: string; band: string };
const LEVEL_WORD = ["Not yet", "Introduced", "Working on it", "Secure"] as const;

function LevelPage() {
  const qc = useQueryClient();
  const load = useServerFn(getLevel);
  const report = useServerFn(recordSelfReport);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["level"], queryFn: () => load() });
  const { data: pieces = [] } = useQuery(piecesQuery);
  const { data: uploads = [] } = useQuery({ queryKey: ["user-pieces-basic"], queryFn: async () => {
    const { data, error } = await supabase.from("user_pieces").select("id,title,composer").order("created_at", { ascending: false });
    if (error) throw error; return data;
  } });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<Custom[]>([]);
  const [draft, setDraft] = useState<Custom>({ title: "", composer: "", band: "Intermediate" });
  const [busy, setBusy] = useState(false);

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["level"] }); void qc.invalidateQueries({ queryKey: ["recommendations"] }); };
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addCustom = (c: Custom) => { if (!c.title.trim() || custom.length >= 5) return; setCustom((l) => [...l, { ...c, title: c.title.trim(), composer: c.composer.trim() }]); setDraft({ title: "", composer: "", band: draft.band }); };

  async function submit() {
    setBusy(true);
    try {
      const r = await report({ data: { pieceIds: [...picked], custom } });
      setPicked(new Set()); setCustom([]); refresh();
      toast.success(r.counted ? `Added ${r.counted} song${r.counted === 1 ? "" : "s"}. Your level is about ${Math.round(r.rating / 10) * 10}.` : "Those songs were already counted.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Those songs could not be saved. Please try again."); }
    finally { setBusy(false); }
  }

  const skills = [...(data?.skills ?? [])].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  return <>
    <PageHeader title="Your level" subtitle="A rating of your playing, from the songs you know and your scored playing." />
    {isLoading ? <p role="status" className="text-muted-foreground">Loading your level…</p>
      : error || !data ? <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-destructive">Your level could not be loaded.</p><Button variant="outline" onClick={() => refetch()}><RotateCcw className="h-4 w-4" />Retry</Button></div>
      : <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <p className="font-display text-5xl">{Math.round(data.rating / 10) * 10}</p>
        <p className="mt-1 text-lg">{data.level} <span className="text-muted-foreground">· {describeRating(data.rating, data.deviation)}</span></p>
        {data.estimated && <p className="mt-2 text-sm text-muted-foreground">This is estimated from your onboarding answer. Play the exercises below to firm it up.</p>}
        <p className="mt-3 text-xs text-muted-foreground">Bands: {LEVEL_BANDS.map((b) => `${b.label} ${b.min}+`).join(" · ")}. This is a skill rating, not a competitive Elo.</p>
      </section>}

    <section className="mt-10" aria-labelledby="ladder-h">
      <h2 id="ladder-h" className="font-display text-2xl">Play a sample</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">Five short exercises, easy to hard. We stop when one gets difficult. Scored playing moves your level the most.</p>
      <LevelLadder onRated={refresh} />
    </section>

    <section className="mt-10" aria-labelledby="songs-h">
      <h2 id="songs-h" className="font-display text-2xl">Songs I can play</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">Tick songs you can already play. These are your own claims, so they count for less than scored playing and can't lift your level far on their own.</p>
      <div className="grid gap-2 sm:grid-cols-2">{pieces.map((p) => <label key={p.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1" checked={picked.has(p.id)} onChange={() => toggle(p.id)} /><span><span className="font-medium">{p.title}</span><br /><span className="text-muted-foreground">{p.composer} · {p.difficulty}</span></span></label>)}</div>
      {uploads.length > 0 && <div className="mt-4"><p className="mb-2 text-sm font-semibold">From your uploads</p><ul className="space-y-1 text-sm">{uploads.map((u) => <li key={u.id} className="flex items-center justify-between gap-3"><span>{u.title}</span><Button variant="outline" size="sm" onClick={() => addCustom({ title: u.title, composer: u.composer ?? "", band: draft.band })} disabled={custom.length >= 5}><Plus className="h-4 w-4" />Add</Button></li>)}</ul></div>}
      <div className="mt-4 rounded-lg border p-4"><p className="text-sm font-semibold">Something else?</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="c-title">Title</Label><Input id="c-title" maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="c-comp">Composer</Label><Input id="c-comp" maxLength={120} value={draft.composer} onChange={(e) => setDraft({ ...draft, composer: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="c-band">How hard is it?</Label><select id="c-band" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={draft.band} onChange={(e) => setDraft({ ...draft, band: e.target.value })}>{LEVEL_BANDS.map((b) => <option key={b.label}>{b.label}</option>)}</select></div>
        </div>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => addCustom(draft)} disabled={!draft.title.trim() || custom.length >= 5}><Plus className="h-4 w-4" />Add to list</Button>
        {custom.length > 0 && <ul className="mt-3 space-y-1 text-sm">{custom.map((c, i) => <li key={i} className="flex items-center justify-between gap-3"><span>{c.title}{c.composer && ` — ${c.composer}`} <span className="text-muted-foreground">· {c.band} · unverified</span></span><button aria-label={`Remove ${c.title}`} onClick={() => setCustom((l) => l.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button></li>)}</ul>}
      </div>
      <Button className="mt-4" onClick={submit} disabled={busy || (picked.size === 0 && custom.length === 0)}>{busy ? "Saving…" : "Add these songs"}</Button>
    </section>

    <section className="mt-10" aria-labelledby="skills-h">
      <h2 id="skills-h" className="font-display text-2xl">Skills</h2>
      {skills.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{skills.map((s) => <li key={s.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{s.name}</span><span className={s.level >= SKILL_HAVE_LEVEL ? "font-semibold text-primary" : "text-muted-foreground"}>{LEVEL_WORD[s.level] ?? ""}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No skills yet. They build as you add songs you can play and log practice sessions on your weekly plan.</p>}
    </section>

    <section className="mt-10" aria-labelledby="hist-h">
      <h2 id="hist-h" className="font-display text-2xl">Recent changes</h2>
      {data?.events.length ? <ul className="mt-3 divide-y">{data.events.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span>{new Date(e.created_at).toLocaleDateString()} · {e.label ?? e.exercise_id ?? e.kind}{e.kind === "self_report" && " · your claim"}</span><span className="font-semibold">{e.rating_before} → {e.rating_after} <span className="font-normal text-muted-foreground">({ratingToLevel(e.rating_after)})</span></span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p>}
    </section>
  </>;
}
