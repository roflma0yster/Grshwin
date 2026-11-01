import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import hero from "@/assets/hero-piano.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Grshwin — Your intermediate piano coach" },
      { name: "description", content: "Daily practice plans, large readable sheet music and a calm coach for Grade 4–6 pianists." },
      { property: "og:title", content: "Grshwin — Your intermediate piano coach" },
      { property: "og:description", content: "Daily practice plans, sheet music and coaching for Grade 4–6 pianists." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl">
          Grshwin
        </span>
        <Button asChild variant="ghost">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-10 md:grid-cols-2 md:py-20">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary">For Grades 4–6</p>
          <h1 className="font-display text-5xl leading-tight md:text-6xl">
            Practise with purpose, not just repetition.
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            A weekly plan built around your level and goals — warm-ups, drills, and a repertoire piece with a
            step-by-step method for mastering it.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Start practising</Link>
            </Button>
          </div>
        </div>
        <img src={hero} width={1536} height={1024} alt="Piano keys beside open sheet music" className="aspect-[4/3] w-full rounded-2xl object-cover shadow-soft" />
      </section>
    </div>
  );
}
