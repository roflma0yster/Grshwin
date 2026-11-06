import { createFileRoute, redirect } from "@tanstack/react-router";

// Uploading now starts from the Library. This keeps old links and bookmarks working.
export const Route = createFileRoute("/_authenticated/upload")({
  beforeLoad: () => { throw redirect({ to: "/library", replace: true }); },
});
