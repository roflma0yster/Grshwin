import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exerciseById, beatMs } from "@/lib/level-exercises";
import { LEVEL_BANDS, levelToRating, outcomeFromScore, ratingToLevel } from "@/lib/rating";

// Ratings are computed and stored on the server only: the browser sends evidence, never a rating.
// Exercise accuracy is reported by the browser (as for saved scores), which is why one run moves the
// rating by a capped amount and the result is labelled an estimate.

const LEVEL_LABELS = LEVEL_BANDS.map((b) => b.label) as [string, ...string[]];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/ /g, "-").slice(0, 80);

async function proficiencyOf(db: SupabaseClient<Database>, userId: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("proficiency").eq("id", userId).maybeSingle();
  return data?.proficiency ?? null;
}

export const getLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { loadRatingState } = await import("@/lib/level.server");
    const proficiency = await proficiencyOf(supabase, userId);
    const [{ state, exists }, { data: events }, { data: levels }, { data: taxonomy }] = await Promise.all([
      loadRatingState(supabase, userId, proficiency),
      supabase.from("rating_events").select("id, kind, label, piece_id, exercise_id, rating_before, rating_after, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(15),
      supabase.from("user_skills").select("skill_id, level"),
      supabase.from("skills").select("id, name, category"),
    ]);
    const info = new Map((taxonomy ?? []).map((s) => [s.id, s]));
    return {
      rating: state.rating, deviation: state.deviation, level: ratingToLevel(state.rating), estimated: !exists,
      events: events ?? [],
      skills: (levels ?? []).map((s) => ({ id: s.skill_id, level: s.level, name: info.get(s.skill_id)?.name ?? s.skill_id, category: info.get(s.skill_id)?.category ?? "" })),
    };
  });

const selfReportSchema = z.object({
  pieceIds: z.array(z.string().uuid()).max(25),
  custom: z.array(z.object({ title: z.string().trim().min(1).max(120), composer: z.string().trim().max(120), band: z.enum(LEVEL_LABELS) })).max(5),
}).refine((v) => v.pieceIds.length + v.custom.length > 0, { message: "Choose at least one song." });

export const recordSelfReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => selfReportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { recordRatingEvidence, recordSkillEvidence, loadRatingState } = await import("@/lib/level.server");
    const proficiency = await proficiencyOf(supabase, userId);
    let counted = 0;
    const ids = [...new Set(data.pieceIds)];
    const { data: pieces } = ids.length ? await supabase.from("pieces").select("id, title, difficulty_rating").in("id", ids) : { data: [] };
    const { data: tags } = ids.length ? await supabase.from("piece_skills").select("piece_id, skill_id, emphasis").in("piece_id", ids) : { data: [] };
    for (const piece of pieces ?? []) {
      const key = `self:piece:${piece.id}`;
      const r = await recordRatingEvidence(userId, proficiency, { evidence: { key, kind: "self_report", targetDifficulty: piece.difficulty_rating, outcome: 1 }, pieceId: piece.id, label: piece.title });
      await recordSkillEvidence(userId, key, "self_report", (tags ?? []).filter((t) => t.piece_id === piece.id));
      if (r.applied) counted++;
    }
    // Songs outside the catalog are unverified claims at a difficulty the player chose. They never enter the shared catalog.
    for (const c of data.custom) {
      const key = `self:custom:${slug(`${c.title} ${c.composer}`)}`;
      const r = await recordRatingEvidence(userId, proficiency, { evidence: { key, kind: "self_report", targetDifficulty: levelToRating(c.band), outcome: 1 }, label: `${c.title}${c.composer ? ` — ${c.composer}` : ""} (unverified)` });
      if (r.applied) counted++;
    }
    const { state } = await loadRatingState(supabase, userId, proficiency);
    return { counted, rating: state.rating, level: ratingToLevel(state.rating) };
  });

const exerciseSchema = z.object({ runId: z.string().uuid(), exerciseId: z.string().max(40), accuracy: z.number().int().min(0).max(100), timingMs: z.number().int().min(0).max(10000).nullable() });

export const recordExerciseResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => exerciseSchema.parse(input))
  .handler(async ({ data, context }) => {
    const exercise = exerciseById(data.exerciseId);
    if (!exercise) throw new Error("Unknown exercise.");
    const { recordRatingEvidence } = await import("@/lib/level.server");
    const proficiency = await proficiencyOf(context.supabase, context.userId);
    const outcome = outcomeFromScore({ accuracy: data.accuracy, timingMs: data.timingMs, beatMs: beatMs(exercise.tempo) });
    const r = await recordRatingEvidence(context.userId, proficiency, {
      evidence: { key: `ex:${data.runId}:${exercise.id}`, kind: "scored_exercise", targetDifficulty: exercise.difficulty, outcome },
      exerciseId: exercise.id, label: exercise.name,
    });
    return { applied: r.applied, rating: r.state.rating, deviation: r.state.deviation, delta: r.delta, level: ratingToLevel(r.state.rating) };
  });

const sessionSchema = z.object({ planId: z.string().uuid(), dayIndex: z.number().int().min(0).max(6) });

/** Called after a practice session is saved: the day's piece teaches its skills (once per session). */
export const recordSessionProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sessionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: plan }, { data: session }] = await Promise.all([
      supabase.from("practice_plans").select("plan").eq("id", data.planId).maybeSingle(),
      supabase.from("practice_sessions").select("minutes, completed_items").eq("plan_id", data.planId).eq("day_index", data.dayIndex).maybeSingle(),
    ]);
    const worked = !!session && (session.minutes > 0 || ((session.completed_items as unknown[]) ?? []).length > 0);
    const pieceId = (plan?.plan as { days?: { pieceId?: string }[] } | undefined)?.days?.[data.dayIndex]?.pieceId;
    if (!worked || !pieceId) return { updated: [] as string[] };
    const { data: tags } = await supabase.from("piece_skills").select("skill_id, emphasis").eq("piece_id", pieceId);
    const { recordSkillEvidence } = await import("@/lib/level.server");
    return { updated: await recordSkillEvidence(userId, `session:${data.planId}:${data.dayIndex}`, "practice_session", tags ?? []) };
  });

const recSchema = z.object({ seedPieceId: z.string().uuid().nullable().optional() });

export const getRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { loadRecommendations } = await import("@/lib/level.server");
    return loadRecommendations(context.supabase, context.userId, data.seedPieceId ?? null);
  });
