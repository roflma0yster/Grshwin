import { pageHead } from "@/lib/head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame, Clock, Library, BookOpen, Ear, Gauge } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { computeStreak, latestPlanQuery, piecesQuery, profileQuery, sessionsQuery, todayIndex } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageHead("Home — KeyCoach", "Today's practice at a glance."),
  component: Dashboard,
});

function Dashboard() {
  const { data: profile } = useQuery(profileQuery);
  const { data: plan } = useQuery(latestPlanQuery);
  const { data: sessions = [] } = useQuery(sessionsQuery);
  const { data: pieces = [] } = useQuery(piecesQuery);

  const practiced = sessions.filter((s) => s.minutes > 0 || (s.completed_items as unknown[]).length > 0);
  const streak = computeStreak(practiced.map((s) => s.session_date));
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const weekly = sessions.filter((s) => s.session_date >= weekAgo).reduce((a, s) => a + s.minutes, 0);
  const today = plan ? plan.plan.days[todayIndex(plan.week_start)] : null;
  const piece = today && pieces.find((p) => p.id === today.pieceId);

  return (
    <>
      <PageHeader title={`Hello${profile?.display_name ? ", " + profile.display_name : ""}`} subtitle={`${profile?.proficiency ?? ""} · ${profile?.genre ?? ""} · ${profile?.daily_minutes ?? 0} min a day`} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat icon={Flame} label="Day streak" value={streak} />
        <Stat icon={Clock} label="Minutes this week" value={weekly} />
      </div>

      <section className="mt-8 rounded-2xl border bg-card p-6 shadow-soft">
        <h2 className="font-display text-2xl">Today's practice</h2>
        {today ? (
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-muted-foreground">{today.focus}</p>
            <p><span className="font-semibold">Warm-up:</span> {today.warmup.title}</p>
            <p><span className="font-semibold">Drills:</span> {today.drills.map((d) => d.title).join(" · ")}</p>
            {piece && <p><span className="font-semibold">Piece:</span> {piece.title} — {piece.composer}</p>}
            <Button asChild className="mt-3"><Link to="/curriculum">Open session</Link></Button>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-muted-foreground">You don't have a plan yet.</p>
            <Button asChild className="mt-3"><Link to="/curriculum">Create my weekly plan</Link></Button>
          </div>
        )}
      </section>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["/library", "Library", Library],
          ["/theory", "Theory", BookOpen],
          ["/ear-training", "Ear training", Ear],
          ["/scoring", "Scoring", Gauge],
        ] as const).map(([to, label, Icon]) => (
          <Link key={to} to={to} className="flex flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary">
            <Icon className="h-5 w-5 text-primary" />
            <span className="font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Flame; label: string; value: number }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card p-5">
      <div className="rounded-full bg-accent p-3 text-accent-foreground"><Icon className="h-5 w-5" /></div>
      <div>
        <div className="font-display text-3xl">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
