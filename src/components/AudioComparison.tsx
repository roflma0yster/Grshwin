import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Save, FolderOpen, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { ComparisonResult } from "@/lib/audio-comparison";

type Recording = { file: File; url: string; samples: Float32Array; sampleRate: number; duration: number; start: number; end: number };
type Saved = Tables<"audio_comparisons">;

function Waveform({ samples }: { samples: Float32Array }) {
  const points = Array.from({ length: 180 }, (_, i) => {
    const from = Math.floor(i * samples.length / 180), to = Math.floor((i + 1) * samples.length / 180);
    let peak = 0; for (let j = from; j < to; j += 8) peak = Math.max(peak, Math.abs(samples[j] ?? 0));
    return { x: i * 4 + 2, height: Math.max(1, peak * 36) };
  });
  return <svg viewBox="0 0 720 80" role="img" aria-label="Recording waveform" className="h-20 w-full text-primary"><path d="M0 40H720" className="stroke-border" />{points.map((p) => <line key={p.x} x1={p.x} x2={p.x} y1={40 - p.height} y2={40 + p.height} stroke="currentColor" strokeWidth="2" />)}</svg>;
}

export function AudioComparison() {
  const qc = useQueryClient();
  const [baseline, setBaseline] = useState<Recording | null>(null), [performance, setPerformance] = useState<Recording | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const attempt = useRef<string | null>(null), urls = useRef<string[]>([]), generation = useRef(0);
  const baselineAudio = useRef<HTMLAudioElement | null>(null), performanceAudio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { generation.current++; urls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  const history = useQuery({ queryKey: ["audio-comparisons"], queryFn: async () => {
    const { data, error } = await supabase.from("audio_comparisons").select("*").order("created_at", { ascending: false }).limit(20);
    if (error) throw error; return data;
  } });
  function resetResult() { setResult(null); setSaved(false); attempt.current = null; setError(""); }
  async function choose(file: File | undefined, kind: "baseline" | "performance") {
    if (!file) return;
    const token = ++generation.current; setBusy("Opening recording…"); resetResult();
    try {
      const analysis = await import("@/lib/audio-comparison"); analysis.validateAudioFile(file);
      const audio = await analysis.decodeRecording(file);
      if (token !== generation.current) return;
      const url = URL.createObjectURL(file); urls.current.push(url);
      const recording = { ...audio, file, url, start: 0, end: audio.duration };
      (kind === "baseline" ? setBaseline : setPerformance)(recording);
    } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : "Recording could not be opened."); }
    finally { if (token === generation.current) setBusy(""); }
  }
  async function compare() {
    if (!baseline || !performance) return;
    setBusy("Comparing recordings…"); resetResult();
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      const analysis = await import("@/lib/audio-comparison");
      const a = analysis.extractFeatures(baseline.samples, baseline.sampleRate, baseline.start, baseline.end);
      const b = analysis.extractFeatures(performance.samples, performance.sampleRate, performance.start, performance.end);
      setResult(analysis.compareFeatures(a, b)); attempt.current = crypto.randomUUID();
    } catch (e) { setError(e instanceof Error ? e.message : "Comparison failed. Try another excerpt."); }
    finally { setBusy(""); }
  }
  async function save() {
    if (!result || !baseline || !performance || !attempt.current || saved) return;
    setBusy("Saving privately…"); setError("");
    const uploaded: string[] = [];
    try {
      const { data, error: authError } = await supabase.auth.getUser(); if (authError || !data.user) throw new Error("Please sign in again.");
      const paths = [baseline, performance].map((r, i) => `${data.user.id}/${attempt.current}/${i}.${r.file.name.split(".").at(-1)?.toLowerCase()}`);
      for (const [i, r] of [baseline, performance].entries()) {
        const path = paths[i]; if (!path) throw new Error("Recording path is unavailable.");
        const { error } = await supabase.storage.from("audio-comparisons").upload(path, r.file);
        if (error && !/already exists|duplicate/i.test(error.message)) throw new Error("Recordings could not be saved. Please retry.");
        if (!error) uploaded.push(path);
      }
      const [baselinePath, performancePath] = paths; if (!baselinePath || !performancePath) return;
      const { error } = await supabase.from("audio_comparisons").insert({ id: attempt.current, user_id: data.user.id, baseline_name: baseline.file.name, performance_name: performance.file.name, baseline_path: baselinePath, performance_path: performancePath, baseline_start: baseline.start, baseline_end: baseline.end, performance_start: performance.start, performance_end: performance.end, result: JSON.parse(JSON.stringify(result)) });
      if (error && error.code !== "23505") throw new Error("Comparison could not be saved. Please retry.");
      setSaved(true); await qc.invalidateQueries({ queryKey: ["audio-comparisons"] });
    } catch (e) {
      if (uploaded.length) await supabase.storage.from("audio-comparisons").remove(uploaded);
      setError(e instanceof Error ? e.message : "Save failed. Please retry.");
    } finally { setBusy(""); }
  }
  async function reopen(row: Saved) {
    setBusy("Opening saved comparison…"); setError("");
    try {
      const recordings = await Promise.all([[row.baseline_path, row.baseline_name, row.baseline_start, row.baseline_end], [row.performance_path, row.performance_name, row.performance_start, row.performance_end]].map(async ([path, name, start, end]) => {
        const { data, error } = await supabase.storage.from("audio-comparisons").download(String(path)); if (error || !data) throw new Error("Saved recording could not be opened.");
        const analysis = await import("@/lib/audio-comparison"); const decoded = await analysis.decodeRecording(data);
        const url = URL.createObjectURL(data); urls.current.push(url);
        return { ...decoded, url, file: new File([data], String(name)), start: Number(start), end: Number(end) };
      }));
      setBaseline(recordings[0] ?? null); setPerformance(recordings[1] ?? null); setResult(row.result as unknown as ComparisonResult); setSaved(true); attempt.current = row.id;
    } catch (e) { setError(e instanceof Error ? e.message : "Saved comparison could not be opened."); }
    finally { setBusy(""); }
  }
  async function remove(row: Saved) {
    if (!window.confirm("Delete this comparison and both recordings?")) return;
    setBusy("Deleting comparison…"); setError("");
    try {
      const { error: storageError } = await supabase.storage.from("audio-comparisons").remove([row.baseline_path, row.performance_path]); if (storageError) throw storageError;
      const { error } = await supabase.from("audio_comparisons").delete().eq("id", row.id); if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["audio-comparisons"] });
    } catch { setError("Deletion failed. Please retry."); } finally { setBusy(""); }
  }
  return <section className="mt-6 space-y-6">
    <div><h2 className="font-display text-2xl">Audio comparison</h2><p className="mt-2 text-sm text-muted-foreground">WAV, MP3 or M4A · up to 20 MB and 5 minutes each · same musical passage</p></div>
    <div className="grid gap-6 md:grid-cols-2">{(["baseline", "performance"] as const).map((kind) => {
      const recording = kind === "baseline" ? baseline : performance;
      const update = kind === "baseline" ? setBaseline : setPerformance;
      const audioRef = kind === "baseline" ? baselineAudio : performanceAudio;
      const label = kind === "baseline" ? "Baseline recording" : "My performance";
      return <div key={kind} className="min-w-0 rounded-md border bg-card p-4"><label htmlFor={`audio-${kind}`} className="font-semibold">{label}</label><Input id={`audio-${kind}`} type="file" accept=".wav,.mp3,.m4a" className="mt-3" disabled={!!busy} onChange={(e) => { void choose(e.target.files?.[0], kind); e.target.value = ""; }} />
        {recording ? <><p className="mt-3 break-words text-sm">{recording.file.name} · {recording.duration.toFixed(1)} s</p><Waveform samples={recording.samples} /><audio ref={audioRef} aria-label={`${label} playback`} className="w-full" src={recording.url} controls preload="metadata" onPlay={() => { const other = kind === "baseline" ? performanceAudio : baselineAudio; other.current?.pause(); if (audioRef.current) audioRef.current.currentTime = recording.start; }} onTimeUpdate={() => { if (audioRef.current && audioRef.current.currentTime >= recording.end) audioRef.current.pause(); }} />
          <div className="mt-4 grid grid-cols-2 gap-3">{(["start", "end"] as const).map((boundary) => <label key={boundary} className="text-xs text-muted-foreground">{boundary === "start" ? "Start" : "End"} (seconds)<Input aria-label={`${label} ${boundary}`} type="number" min={0} max={recording.duration} step={0.1} value={Number(recording[boundary].toFixed(2))} disabled={!!busy} onChange={(e) => { update({ ...recording, [boundary]: Number(e.target.value) }); resetResult(); }} /></label>)}</div>
        </> : <div className="flex h-40 items-center justify-center text-muted-foreground"><AudioLines className="h-10 w-10" aria-hidden /></div>}
      </div>;
    })}</div>
    <div className="flex flex-wrap items-center gap-3"><Button onClick={compare} disabled={!baseline || !performance || !!busy}><AudioLines className="h-4 w-4" />Compare recordings</Button>{result && <Button variant="outline" disabled={!!busy || saved} onClick={save}><Save className="h-4 w-4" />{saved ? "Saved privately" : "Save comparison"}</Button>}{busy && <p role="status" className="text-sm text-muted-foreground">{busy}</p>}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <section aria-label="Audio comparison results" className="border-y py-6"><div className="grid gap-6 sm:grid-cols-3"><div><p className="font-display text-3xl">{result.similarity}%</p><p className="text-sm text-muted-foreground">Pitch-pattern similarity</p></div><div><p className="font-display text-3xl">{result.tempoRatio.toFixed(2)}×</p><p className="text-sm text-muted-foreground">Relative tempo · 1.00× matches</p></div><div><p className="font-display text-3xl">{result.timingDeviationMs} ms</p><p className="text-sm text-muted-foreground">Alignment variation</p></div></div><ul className="mt-4 space-y-1 text-sm text-muted-foreground">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul><h3 className="mt-6 font-semibold">Passage comparison</h3><div className="mt-2 max-h-56 overflow-y-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Baseline</th><th>Performance</th><th>Similarity</th></tr></thead><tbody>{result.segments.map((s, i) => <tr key={i} className="border-t"><td className="py-2">{s.baselineTime.toFixed(1)} s</td><td>{s.performanceTime.toFixed(1)} s</td><td>{s.similarity}%</td></tr>)}</tbody></table></div></section>}
    <section><h2 className="font-display text-2xl">Saved comparisons</h2>{history.isLoading ? <p role="status" className="mt-3 text-muted-foreground">Loading comparisons…</p> : history.error ? <Button variant="outline" onClick={() => history.refetch()}><RotateCcw className="h-4 w-4" />Retry saved comparisons</Button> : history.data?.length ? <ul className="mt-3 divide-y">{history.data.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm">{row.performance_name}</p><p className="break-words text-xs text-muted-foreground">Against {row.baseline_name} · {new Date(row.created_at).toLocaleDateString()}</p></div><div className="flex gap-2"><Button variant="outline" disabled={!!busy} onClick={() => reopen(row)}><FolderOpen className="h-4 w-4" />Open</Button><Button variant="ghost" size="icon" aria-label={`Delete ${row.performance_name}`} title="Delete comparison" disabled={!!busy} onClick={() => remove(row)}><Trash2 className="h-4 w-4" /></Button></div></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No saved audio comparisons yet.</p>}</section>
  </section>;
}