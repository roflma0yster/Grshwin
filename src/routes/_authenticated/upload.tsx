import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Upload, FileMusic, ArrowUpRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { uploadScore } from "@/lib/upload.functions";
import { convertPdfScore, MAX_PDF_BYTES } from "@/lib/omr.functions";
import { validateScore } from "@/lib/score-validation";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => pageHead("Your scores — Grshwin", "Upload and practise your own private MusicXML piano scores."),
  component: UploadPage,
});

function UploadPage() {
  const upload = useServerFn(uploadScore);
  const convertPdf = useServerFn(convertPdfScore);
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data: pieces = [], isLoading, error: listError, refetch } = useQuery({ queryKey: ["user-pieces"], queryFn: async () => {
    const { data, error } = await supabase.from("user_pieces").select("id,title,composer,created_at,file_path").order("created_at", { ascending: false });
    if (error) throw error; return data;
  } });
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!file) return;
    setBusy(true); setError("");
    try {
      if (/\.pdf$/i.test(file.name)) {
        if (file.size > MAX_PDF_BYTES) throw new Error("The PDF must be smaller than 15 MB.");
        const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error("Sign in again");
        const pdfPath = `${auth.user.id}/${crypto.randomUUID()}.pdf`;
        const { error: upError } = await supabase.storage.from("scores").upload(pdfPath, file, { contentType: "application/pdf" });
        if (upError) throw new Error("The PDF could not be uploaded. Please try again.");
        await convertPdf({ data: { title, composer, pdfPath } });
      } else {
        if (!/\.(xml|musicxml)$/i.test(file.name)) throw new Error("Choose a .pdf, .xml or .musicxml file.");
        if (file.size > 5242880) throw new Error("The score must be smaller than 5 MB.");
        const xml = validateScore(await file.text());
        await upload({ data: { title, composer, xml } });
      }
      await qc.invalidateQueries({ queryKey: ["user-pieces"] });
      setFile(null); setTitle(""); setComposer("");
      toast.success("Your score is ready to practise");
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeader title="Your scores" subtitle="Your own repertoire, kept private." />
    <form onSubmit={submit} className="grid gap-6 border-y py-6 md:grid-cols-2">
      <div className="space-y-3"><Label htmlFor="score-file" className="flex items-center gap-2"><FileMusic className="h-5 w-5 text-primary" />MusicXML score or PDF</Label><Input key={file?.name ?? "empty"} id="score-file" type="file" accept=".xml,.musicxml,.pdf" disabled={busy} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setError(""); if (f && !title) setTitle(f.name.replace(/\.(musicxml|xml|pdf)$/i, "")); }} /><p className="text-xs text-muted-foreground">.musicxml or .xml up to 5 MB (uncompressed) · or a typeset PDF up to 15 MB, converted automatically (can take a minute; check the result)</p></div>
      <div className="space-y-4"><div className="space-y-2"><Label htmlFor="score-title">Title</Label><Input id="score-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} /></div><div className="space-y-2"><Label htmlFor="score-composer">Composer</Label><Input id="score-composer" maxLength={120} value={composer} onChange={(e) => setComposer(e.target.value)} disabled={busy} /></div><Button type="submit" disabled={!file || !title.trim() || busy}><Upload className="h-4 w-4" />{busy ? (file && /\.pdf$/i.test(file.name) ? "Converting… this can take a minute" : "Uploading…") : "Upload score"}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
    </form>
    <h2 className="mt-8 mb-4 font-display text-2xl">Uploaded repertoire</h2>
    {isLoading ? <p className="text-muted-foreground">Loading scores…</p> : listError ? <div className="space-y-3 py-6"><p role="alert" className="text-destructive">Your scores could not be loaded.</p><Button variant="outline" onClick={() => refetch()}><RotateCcw className="h-4 w-4" />Retry</Button></div> : !pieces.length ? <p className="py-8 text-muted-foreground">No scores uploaded yet.</p> : <div className="divide-y">{pieces.map((p) => <Link key={p.id} to="/my-piece/$id" params={{ id: p.id }} className="flex items-center justify-between gap-4 py-5 hover:text-primary"><div><h3 className="font-display text-xl">{p.title}</h3><p className="text-sm text-muted-foreground">{p.composer || "Composer not specified"}</p></div><ArrowUpRight className="h-5 w-5 shrink-0" /></Link>)}</div>}
  </>;
}
