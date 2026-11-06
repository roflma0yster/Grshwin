import { QueryClient } from "@tanstack/react-query";
import { createRouter, isRedirect, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { NAV } from "@/components/AppShell";
import { Route as UploadRoute } from "@/routes/_authenticated/upload";
import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});

describe("Upload lives in the Library", () => {
  it("no longer has its own navigation item", () => {
    const targets = NAV.map((item) => item.to);
    expect(targets).not.toContain("/upload");
    expect(targets).toContain("/library");
  });
  it("sends old /upload links to the Library", () => {
    let thrown: unknown;
    try { (UploadRoute.options.beforeLoad as (context: never) => void)({} as never); } catch (error) { thrown = error; }
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { options: { to: string } }).options.to).toBe("/library");
  });
});
