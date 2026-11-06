// Server-only: rating and skill writes (service role) and recommendation loading.
// Never import this from a route or component; load it inside server function handlers.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractPieceFeatures, refinedDifficulty, type PieceFeatures } from "@/lib/piece-features";
import { initialState, ratingToLevel, updateRating, type Evidence, type EvidenceKind, type RatingState } from "@/lib/rating";
import { recommend, type Candidate, type PieceSkill } from "@/lib/recommend";
import { nextSkillLevel, type SkillSource } from "@/lib/skills";

type Db = SupabaseClient<Database>;
const UNIQUE_VIOLATION = "23505";
const today = () => new Date().toISOString().slice(0, 10);

export async function loadRatingState(db: Db, userId: string, proficiency: string | null | undefined) {
  const { data, error } = await db.from("player_ratings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Your level could not be loaded.");
  if (!data) return { state: initialState(proficiency), updatedAt: null as string | null, exists: false };
  const state: RatingState = {
    rating: data.rating, deviation: Number(data.deviation), baseline: data.baseline, scoredCeiling: data.scored_ceiling,
    movedToday: data.moved_on === today() ? data.moved_today : 0,
  };
  return { state, updatedAt: data.updated_at, exists: true };
}

export async function recordRatingEvidence(userId: string, proficiency: string | null | undefined, input: { evidence: Evidence & { kind: EvidenceKind }; pieceId?: string | null; exerciseId?: string | null; label?: string | null }) {
  const admin: Db = supabaseAdmin;
  const current = await loadRatingState(admin, userId, proficiency);
  const days = current.updatedAt ? (Date.now() - new Date(current.updatedAt).getTime()) / 86400000 : 0;
  const { state, delta } = updateRating(current.state, input.evidence, { daysSinceUpdate: days });
  const { evidence } = input;

  // The unique (user_id, evidence_key) constraint is what makes retries safe: insert first.
  const { error: eventError } = await admin.from("rating_events").insert({
    user_id: userId, evidence_key: evidence.key, kind: evidence.kind, piece_id: input.pieceId ?? null, exercise_id: input.exerciseId ?? null,
    label: input.label ?? null, target_difficulty: evidence.targetDifficulty, outcome: evidence.outcome,
    rating_before: current.state.rating, rating_after: state.rating, deviation_after: state.deviation,
  });
  if (eventError) {
    if (eventError.code === UNIQUE_VIOLATION) return { applied: false, state: current.state, delta: 0 };
    throw new Error("Your result could not be saved. Please try again.");
  }
  const { error: ratingError } = await admin.from("player_ratings").upsert({
    user_id: userId, rating: state.rating, deviation: state.deviation, baseline: state.baseline, scored_ceiling: state.scoredCeiling,
    moved_today: state.movedToday, moved_on: today(), updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (ratingError) {
    await admin.from("rating_events").delete().eq("user_id", userId).eq("evidence_key", evidence.key); // undo, so a retry can count
    throw new Error("Your result could not be saved. Please try again.");
  }
  return { applied: true, state, delta };
}

/** Raises skill levels for the strong (emphasis 2+) skills of a piece, once per evidence key. */
export async function recordSkillEvidence(userId: string, key: string, source: SkillSource, skills: { skill_id: string; emphasis: number }[]) {
  const admin: Db = supabaseAdmin;
  const strong = skills.filter((s) => s.emphasis >= 2);
  if (!strong.length) return [] as string[];
  const { data: rows } = await admin.from("user_skills").select("skill_id, level").eq("user_id", userId).in("skill_id", strong.map((s) => s.skill_id));
  const levels = new Map((rows ?? []).map((r) => [r.skill_id, r.level]));
  const changed: string[] = [];
  for (const s of strong) {
    const before = levels.get(s.skill_id) ?? 0;
    const after = nextSkillLevel(before, source);
    if (after <= before) continue;
    const { error } = await admin.from("user_skill_events").insert({ user_id: userId, evidence_key: key, skill_id: s.skill_id, level_before: before, level_after: after });
    if (error) { if (error.code === UNIQUE_VIOLATION) continue; throw new Error("Your progress could not be saved."); }
    const { error: upError } = await admin.from("user_skills").upsert({ user_id: userId, skill_id: s.skill_id, level: after, source, updated_at: new Date().toISOString() }, { onConflict: "user_id,skill_id" });
    if (upError) { await admin.from("user_skill_events").delete().eq("user_id", userId).eq("evidence_key", key).eq("skill_id", s.skill_id); throw new Error("Your progress could not be saved."); }
    changed.push(s.skill_id);
  }
  return changed;
}

// Features from a published MusicXML file, fetched at most once per server process.
const featureCache = new Map<string, PieceFeatures | null>();
async function featuresFor(url: string | null): Promise<PieceFeatures | null> {
  if (!url) return null;
  if (featureCache.has(url)) return featureCache.get(url) ?? null;
  let features: PieceFeatures | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) features = extractPieceFeatures((await res.text()).slice(0, 5_000_000));
  } catch { /* fall back to label-based difficulty */ }
  featureCache.set(url, features);
  return features;
}

export async function loadRecommendations(db: Db, userId: string, seedPieceId: string | null) {
  const [{ data: profile }, { data: pieces }, { data: skills }, { data: pieceSkills }, { data: mine }, { data: mySkillTags }, { data: events }, { data: levels }] = await Promise.all([
    db.from("profiles").select("proficiency, genre").eq("id", userId).maybeSingle(),
    db.from("pieces").select("id, title, composer, genre, difficulty, difficulty_rating, musicxml_url"),
    db.from("skills").select("id, name, category"),
    db.from("piece_skills").select("piece_id, skill_id, emphasis, note"),
    db.from("user_pieces").select("id, title, composer, genre, difficulty_rating").eq("user_id", userId).not("difficulty_rating", "is", null),
    db.from("user_piece_skills").select("user_piece_id, skill_id, emphasis, note").eq("user_id", userId),
    db.from("rating_events").select("piece_id").eq("user_id", userId).eq("kind", "self_report").not("piece_id", "is", null),
    db.from("user_skills").select("skill_id, level").eq("user_id", userId),
  ]);
  const { state, exists } = await loadRatingState(db, userId, profile?.proficiency);
  const skillInfo = new Map((skills ?? []).map((s) => [s.id, s]));
  const tag = (t: { skill_id: string; emphasis: number; note: string }): PieceSkill | null => {
    const info = skillInfo.get(t.skill_id);
    return info ? { id: info.id, name: info.name, category: info.category as PieceSkill["category"], emphasis: t.emphasis, note: t.note } : null;
  };
  const tagsFor = (rows: { skill_id: string; emphasis: number; note: string; key: string }[], key: string) => rows.filter((r) => r.key === key).map(tag).filter((x): x is PieceSkill => !!x);

  const catalog: Candidate[] = await Promise.all((pieces ?? []).map(async (p) => {
    const features = await featuresFor(p.musicxml_url);
    return {
      id: p.id, title: p.title, composer: p.composer, genre: p.genre, difficultyLabel: p.difficulty, ownerId: null, features,
      difficultyRating: refinedDifficulty(p.difficulty_rating, features),
      skills: tagsFor((pieceSkills ?? []).map((r) => ({ ...r, key: r.piece_id })), p.id),
    };
  }));
  const uploads: Candidate[] = (mine ?? []).map((u) => ({
    id: u.id, title: u.title, composer: u.composer ?? "Your upload", genre: u.genre ?? "Other", difficultyLabel: ratingToLevel(u.difficulty_rating ?? 0), difficultyRating: u.difficulty_rating ?? 0,
    ownerId: userId, features: null, skills: tagsFor((mySkillTags ?? []).map((r) => ({ ...r, key: r.user_piece_id })), u.id),
  }));
  const result = recommend([...catalog, ...uploads], {
    userId, rating: state.rating, deviation: state.deviation, preferredGenre: profile?.genre ?? null,
    skillLevels: Object.fromEntries((levels ?? []).map((l) => [l.skill_id, l.level])),
    knownPieceIds: new Set((events ?? []).map((e) => e.piece_id).filter((x): x is string => !!x)),
    seedPieceId,
  });
  return { ...result, rating: state.rating, deviation: state.deviation, level: ratingToLevel(state.rating), estimated: !exists };
}
