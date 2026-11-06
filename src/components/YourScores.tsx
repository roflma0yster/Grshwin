import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/** The player's own uploaded scores (private; never part of the shared catalog). */
export function YourScores() {
  const { data: pieces = [], isLoading, error: listError, refetch } = useQuery({ queryKey: ["user-pieces"], queryFn: async () => {
    const { data, error } = await supabase.from("user_pieces").select("id,title,composer,created_at,file_path").order("created_at", { ascending: false });
    if (error) throw error; return data;
  } });
  return (
    <section aria-labelledby="your-scores-heading" className="mb-10">
      <h2 id="your-scores-heading" className="mb-4 font-display text-2xl">Your scores</h2>
      {isLoading ? <p className="text-muted-foreground">Loading scores…</p> : listError ? <div className="space-y-3 py-6"><p role="alert" className="text-destructive">Your scores could not be loaded.</p><Button variant="outline" onClick={() => refetch()}><RotateCcw className="h-4 w-4" />Retry</Button></div> : !pieces.length ? <p className="py-8 text-muted-foreground">No scores uploaded yet. Use “Upload score” at the top right.</p> : <div className="divide-y">{pieces.map((p) => <Link key={p.id} to="/my-piece/$id" params={{ id: p.id }} className="flex items-center justify-between gap-4 py-5 hover:text-primary"><div><h3 className="font-display text-xl">{p.title}</h3><p className="text-sm text-muted-foreground">{p.composer || "Composer not specified"}</p></div><ArrowUpRight className="h-5 w-5 shrink-0" /></Link>)}</div>}
    </section>
  );
}
