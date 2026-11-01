import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SheetMusic } from "@/components/SheetMusic";
import { ScorePlayback } from "@/components/ScorePlayback";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/my-piece/$id")({
  head: () => pageHead("Your score player — Grshwin", "Read and play your privately uploaded piano score."),
  component: UserPiece,
});

function UserPiece() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ["user-piece", id], queryFn: async () => {
    const { data: piece, error } = await supabase.from("user_pieces").select("id,title,composer,file_path").eq("id", id).single();
    if (error) throw error;
    if (!piece.file_path) throw new Error("This score has no file.");
    const { data: blob, error: downloadError } = await supabase.storage.from("scores").download(piece.file_path);
    if (downloadError || !blob) throw new Error("The score file could not be loaded.");
    return { ...piece, xml: await blob.text() };
  } });
  return <><Link to="/upload" className="text-sm text-muted-foreground">← Your scores</Link>{isLoading ? <p className="mt-6">Loading score…</p> : error || !data ? <p role="alert" className="mt-6 text-destructive">This score is unavailable. Return to your scores and try again.</p> : <><h1 className="mt-3 font-display text-3xl">{data.title}</h1><p className="mt-1 text-muted-foreground">{data.composer}</p><ScorePlayback xml={data.xml} /><div className="mt-6"><SheetMusic xml={data.xml} zoom={1.1} /></div></>}</>;
}