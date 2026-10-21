import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateCurriculum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured.");

    const [{ data: profile, error: pe }, { data: pieces, error: le }] = await Promise.all([
      supabase.from("profiles").select("genre, proficiency, goal, daily_minutes").eq("id", userId).single(),
      supabase.from("pieces").select("id, title, composer, genre, difficulty, key_signature"),
    ]);
    if (pe || !profile) throw new Error("Complete onboarding first.");
    if (le || !pieces?.length) throw new Error("The library is empty.");

    const { generateWeeklyPlan } = await import("@/lib/ai/curriculum.server");
    const plan = await generateWeeklyPlan(apiKey, { profile, pieces });

    const { data, error } = await supabase
      .from("practice_plans")
      .insert({ user_id: userId, plan: plan as never, week_start: new Date().toISOString().slice(0, 10) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
