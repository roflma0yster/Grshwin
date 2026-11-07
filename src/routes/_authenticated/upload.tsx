import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";

// Uploading now starts from the Library. This keeps old links and bookmarks working.
export const Route = createFileRoute("/_authenticated/upload")({
  head: () => pageHead("Upload a score — Grshwin", "Add a private piano score to your Grshwin library."),
  beforeLoad: () => { throw redirect({ to: "/library", replace: true }); },
});
