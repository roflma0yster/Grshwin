import { pageHead } from "@/lib/head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Upload } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Recommendations } from "@/components/Recommendations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UploadScoreForm } from "@/components/UploadScoreForm";
import { YourScores } from "@/components/YourScores";
import { piecesQuery } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => pageHead("Library — Grshwin", "Public-domain repertoire for intermediate pianists."),
  validateSearch: (search: Record<string, unknown>): { like?: string } => ({ like: typeof search.like === "string" && search.like ? search.like : undefined }),
  component: LibraryPage,
});

const GENRES = ["All", "Classical", "Jazz", "Blues", "Pop"];

function LibraryPage() {
  const { like } = Route.useSearch();
  const { data: pieces = [] } = useQuery(piecesQuery);
  const [genre, setGenre] = useState("All");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  // A running upload (a PDF can take a minute to convert) must not be closed by accident.
  const handleOpenChange = (open: boolean) => {
    if (!open && uploading) return;
    if (open) setUploading(false);
    setUploadOpen(open);
  };
  const keepOpenWhileUploading = (event: Event) => { if (uploading) event.preventDefault(); };
  const list = pieces.filter((p) => genre === "All" || p.genre === genre);
  return (
    <>
      <PageHeader title="Library" subtitle="Public-domain pieces chosen for Grades 4–6.">
        <Dialog open={uploadOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild><Button><Upload className="h-4 w-4" />Upload score</Button></DialogTrigger>
          <DialogContent className="sm:max-w-2xl" onEscapeKeyDown={keepOpenWhileUploading} onPointerDownOutside={keepOpenWhileUploading} onInteractOutside={keepOpenWhileUploading}>
            <DialogHeader>
              <DialogTitle>Upload a score</DialogTitle>
              <DialogDescription>Your scores are private to you. PDFs are converted automatically and can take a minute, so keep this window open until it finishes.</DialogDescription>
            </DialogHeader>
            <UploadScoreForm onBusyChange={setUploading} onDone={() => { setUploading(false); setUploadOpen(false); }} />
          </DialogContent>
        </Dialog>
      </PageHeader>
      <Recommendations key={like ?? "none"} seedPieceId={like ?? null} title={like ? `More like ${pieces.find((p) => p.id === like)?.title ?? "this piece"}` : "Recommended for you"} />
      <YourScores />
      <h2 className="mb-4 font-display text-2xl">All pieces</h2>
      <div className="mb-6 flex flex-wrap gap-2">
        {GENRES.map((g) => (
          <button key={g} onClick={() => setGenre(g)} className={cn("rounded-full border px-4 py-1.5 text-sm", genre === g && "border-primary bg-accent text-accent-foreground")}>
            {g}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {list.map((p) => (
          <Link key={p.id} to="/piece/$id" params={{ id: p.id }} className="rounded-2xl border bg-card p-5 transition-colors hover:border-primary">
            <h3 className="font-display text-xl">{p.title}</h3>
            <p className="text-sm text-muted-foreground">{p.composer}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="secondary">{p.genre}</Badge>
              <Badge variant="secondary">{p.difficulty}</Badge>
              <Badge variant="secondary">{p.key_signature}</Badge>
            </div>
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>{p.license}</span>
              <span>MusicXML: {p.musicxml_status}</span>
            </div>
            {p.source_url && <p className="mt-1 truncate text-xs text-muted-foreground">Source: {new URL(p.source_url).hostname}</p>}
          </Link>
        ))}
      </div>
    </>
  );
}
