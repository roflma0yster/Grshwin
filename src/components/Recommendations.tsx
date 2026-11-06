import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRecommendations } from "@/lib/rating.functions";
import { describeRating } from "@/lib/rating";
import { cn } from "@/lib/utils";

const FIT_LABEL = { comfortable: "Comfortable fit", stretch: "Gentle stretch", challenge: "Challenge" } as const;

/** Ranked suggestions with a "what you'll learn" breakdown. Pass a seed piece for "more like this". */
export function Recommendations({ seedPieceId = null, title = "Recommended for you" }: { seedPieceId?: string | null; title?: string }) {
  const load = useServerFn(getRecommendations);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["recommendations", seedPieceId], queryFn: () => load({ data: { seedPieceId } }) });

  return (
    <section aria-labelledby="recs-heading" className="mb-10">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="recs-heading" className="font-display text-2xl">{title}</h2>
        {data && <p className="text-sm text-muted-foreground">Your level: {data.level}, {describeRating(data.rating, data.deviation)}{data.estimated ? " · estimated from your onboarding answer" : ""} · <Link to="/level" className="underline">improve this</Link></p>}
      </div>
      {isLoading ? <p role="status" className="text-muted-foreground">Finding pieces for you…</p>
        : error || !data ? <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-destructive">Suggestions could not be loaded.</p><Button variant="outline" onClick={() => refetch()}><RotateCcw className="h-4 w-4" />Retry</Button></div>
        : <>
          {data.notes.map((n) => <p key={n} role="status" className="mb-3 text-sm text-muted-foreground">{n}</p>)}
          <div className="grid gap-4 md:grid-cols-2">
            {data.recommendations.map(({ piece, fit, reasons, learn, have, difficultyDelta }) => (
              <article key={piece.id} className="rounded-2xl border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl">{piece.title}</h3>
                    <p className="text-sm text-muted-foreground">{piece.composer}</p>
                  </div>
                  <Badge className={cn(fit === "challenge" && "bg-destructive/10 text-destructive")} variant="secondary">{FIT_LABEL[fit]}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5"><Badge variant="secondary">{piece.genre}</Badge><Badge variant="secondary">{piece.difficultyLabel}</Badge>{piece.ownerId && <Badge variant="secondary">Your upload</Badge>}</div>
                <p className="mt-2 text-xs text-muted-foreground">{difficultyDelta === 0 ? "Right at your level" : `${Math.abs(Math.round(difficultyDelta / 10) * 10)} points ${difficultyDelta > 0 ? "above" : "below"} your level`}</p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                <details className="mt-3 rounded-lg border p-3 text-sm">
                  <summary className="cursor-pointer font-semibold">What you'll learn ({learn.length})</summary>
                  {learn.length ? <ul className="mt-2 space-y-2">{learn.map((s) => <li key={s.id}><span className="font-medium">{s.name}</span> <span className="text-xs text-muted-foreground">· {s.category}</span><br /><span className="text-muted-foreground">{s.note}</span></li>)}</ul> : <p className="mt-2 text-muted-foreground">{piece.skills.length ? "You already have the main skills this piece teaches." : "No skills have been tagged for this piece yet."}</p>}
                  {have.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Skills you already have: {have.map((s) => s.name).join(", ")}</p>}
                </details>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm">{piece.ownerId ? <Link to="/my-piece/$id" params={{ id: piece.id }}>Practise this</Link> : <Link to="/piece/$id" params={{ id: piece.id }}>Practise this</Link>}</Button>
                  {!piece.ownerId && <Button asChild size="sm" variant="outline"><Link to="/library" search={{ like: piece.id }}>More like this</Link></Button>}
                </div>
              </article>
            ))}
          </div>
        </>}
    </section>
  );
}
