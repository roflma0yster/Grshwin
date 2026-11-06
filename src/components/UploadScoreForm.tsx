import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, FileMusic } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { uploadScore } from "@/lib/upload.functions";
import { convertPdfScore, MAX_PDF_BYTES } from "@/lib/omr.functions";
import { validateScore } from "@/lib/score-validation";

/** The score upload form (MusicXML or PDF). Unchanged behaviour; it now lives in the Library's upload dialog. */
export function UploadScoreForm({ onDone, onBusyChange, className }: { onDone?: () => void; onBusyChange?: (busy: boolean) => void; className?: string }) {
  const upload = useServerFn(uploadScore);
  const convertPdf = useServerFn(convertPdfScore);
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
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
      toast.success("Your score is ready to practice");
      onDone?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed. Please try again."); }
    finally { setBusy(false); }
  }
  return (
  <form onSubmit={submit} className={className ?? "grid gap-6 md:grid-cols-2"}>
    <div className="space-y-3"><Label htmlFor="score-file" className="flex items-center gap-2"><FileMusic className="h-5 w-5 text-primary" />MusicXML score or PDF</Label><Input key={file?.name ?? "empty"} id="score-file" type="file" accept=".xml,.musicxml,.pdf" disabled={busy} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setError(""); if (f && !title) setTitle(f.name.replace(/\.(musicxml|xml|pdf)$/i, "")); }} /><p className="text-xs text-muted-foreground">.musicxml or .xml up to 5 MB (uncompressed) · or a typeset PDF up to 15 MB, converted automatically (can take a minute; check the result)</p></div>
    <div className="space-y-4"><div className="space-y-2"><Label htmlFor="score-title">Title</Label><Input id="score-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} /></div><div className="space-y-2"><Label htmlFor="score-composer">Composer</Label><Input id="score-composer" maxLength={120} value={composer} onChange={(e) => setComposer(e.target.value)} disabled={busy} /></div><Button type="submit" disabled={!file || !title.trim() || busy}><Upload className="h-4 w-4" />{busy ? (file && /\.pdf$/i.test(file.name) ? "Converting… this can take a minute" : "Uploading…") : "Upload score"}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
  </form>
  );
}
