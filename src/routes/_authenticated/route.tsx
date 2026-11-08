import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

// Guest access: visitors without an account get a private guest session automatically.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) return { user: data.user };
    const { data: guest, error } = await supabase.auth.signInAnonymously();
    if (error || !guest.user) throw error ?? new Error("Could not start a guest session");
    return { user: guest.user };
  },
  component: AppShell,
});
