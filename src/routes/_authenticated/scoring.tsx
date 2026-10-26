import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/_authenticated/scoring")({
  head: () => ({ meta: [{ title: "Scoring — KeyCoach" }, { name: "description", content: "Feedback on accuracy and timing as you play." }] }),
  component: () => <ComingSoon title="Scoring" text="Feedback on accuracy and timing as you play." />,
});
