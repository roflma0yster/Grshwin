import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Home, Library, CalendarDays, BookOpen, Ear, Upload, Gauge, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/data";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/curriculum", label: "Plan", icon: CalendarDays },
  { to: "/library", label: "Library", icon: Library },
  { to: "/theory", label: "Theory", icon: BookOpen },
  { to: "/ear-training", label: "Ear", icon: Ear },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/scoring", label: "Scoring", icon: Gauge },
] as const;

export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery(profileQuery);

  useEffect(() => {
    if (!isLoading && profile && !profile.onboarded && pathname !== "/onboarding") {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [isLoading, profile, pathname, navigate]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (pathname === "/onboarding") return <Outlet />;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 md:pl-56">
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r bg-sidebar p-4 md:flex">
        <Link to="/dashboard" className="mb-8 px-2 font-display text-2xl">
          Grshwin
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent",
                pathname.startsWith(to) && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
        </nav>
        <button onClick={signOut} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
        <span className="font-display text-xl">
          Grshwin
        </span>
        <button onClick={signOut} aria-label="Sign out" className="text-muted-foreground">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t bg-card py-2 md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={cn("flex flex-col items-center gap-0.5 px-1 text-[10px] text-muted-foreground", pathname.startsWith(to) && "text-primary")}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
