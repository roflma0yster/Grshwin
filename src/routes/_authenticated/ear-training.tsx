import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/_authenticated/ear-training")({
  head: () => ({ meta: [{ title: "Ear Training — KeyCoach" }, { name: "description", content: "Intervals, chords and rhythm dictation." }] }),
  component: () => <ComingSoon title="Ear Training" text="Intervals, chords and rhythm dictation." />,
});
