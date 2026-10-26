import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Upload — KeyCoach" }, { name: "description", content: "Upload your own MusicXML scores." }] }),
  component: () => <ComingSoon title="Upload" text="Upload your own MusicXML scores." />,
});
