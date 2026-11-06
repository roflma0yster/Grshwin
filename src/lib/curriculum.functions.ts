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

    // Optional context from the level rating; players without a stored rating get the plan as before.
    let levelContext: string | null = null;
    try {
      const { loadRecommendations, loadRatingState } = await import("@/lib/level.server");
      const { exists } = await loadRatingState(supabase, userId, profile.proficiency);
      if (exists) {
        const rec = await loadRecommendations(supabase, userId, null);
        const gaps = [...new Map(rec.recommendations.flatMap((r) => r.learn).map((s) => [s.id, s])).values()].sort((a, b) => b.emphasis - a.emphasis).slice(0, 4).map((s) => s.name.toLowerCase());
        levelContext = `Measured level rating: about ${Math.round(rec.rating / 10) * 10} (${rec.level}).${gaps.length ? ` Skills to build next: ${gaps.join(", ")}.` : ""} Use this only to tune difficulty and drills; still choose pieces from the library list.`;
      }
    } catch { /* the plan does not depend on it */ }

    const { generateWeeklyPlan } = await import("@/lib/ai/curriculum.server");
    const plan = await generateWeeklyPlan(apiKey, { profile, pieces, levelContext });

    const { data, error } = await supabase
      .from("practice_plans")
      .insert({ user_id: userId, plan: plan as never, week_start: new Date().toISOString().slice(0, 10) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
