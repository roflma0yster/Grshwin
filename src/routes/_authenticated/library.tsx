import { pageHead } from "@/lib/head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Recommendations } from "@/components/Recommendations";
import { Badge } from "@/components/ui/badge";
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
  const list = pieces.filter((p) => genre === "All" || p.genre === genre);
  return (
    <>
      <PageHeader title="Library" subtitle="Public-domain pieces chosen for Grades 4–6." />
      <Recommendations key={like ?? "none"} seedPieceId={like ?? null} title={like ? `More like ${pieces.find((p) => p.id === like)?.title ?? "this piece"}` : "Recommended for you"} />
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
