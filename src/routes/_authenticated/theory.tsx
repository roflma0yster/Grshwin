import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/_authenticated/theory")({
  head: () => ({ meta: [{ title: "Theory — KeyCoach" }, { name: "description", content: "Bite-sized theory lessons tied to the pieces you're learning." }] }),
  component: () => <ComingSoon title="Theory" text="Bite-sized theory lessons tied to the pieces you're learning." />,
});
