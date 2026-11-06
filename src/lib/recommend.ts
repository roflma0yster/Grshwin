// Deterministic piece recommendations. Any AI step may only reword these results,
// never add, remove or reorder pieces (see AGENTS.md).
import { featureSimilarity, type PieceFeatures } from "@/lib/piece-features";
import { hasSkill, type SkillCategory } from "@/lib/skills";

export type PieceSkill = { id: string; name: string; category: SkillCategory; emphasis: number; note: string };

export type Candidate = {
  id: string;
  title: string;
  composer: string;
  genre: string;
  difficultyLabel: string;
  difficultyRating: number;
  skills: PieceSkill[];
  features?: PieceFeatures | null;
  /** null = shared catalog; otherwise the only user who may see this piece. */
  ownerId: string | null;
};

export type Player = {
  userId: string;
  rating: number;
  deviation: number;
  preferredGenre?: string | null;
  /** Skill id -> level (0-3). */
  skillLevels: Readonly<Record<string, number>>;
  /** Pieces the player says they can already play: never recommended, and used to judge style. */
  knownPieceIds: ReadonlySet<string>;
  recentlyRecommendedIds?: ReadonlySet<string>;
  /** "More like this": the style anchor, which is also excluded from the results. */
  seedPieceId?: string | null;
};

export type Fit = "comfortable" | "stretch" | "challenge";

export type Recommendation = {
  piece: Candidate;
  fit: Fit;
  score: number;
  /** Piece difficulty minus player rating. */
  difficultyDelta: number;
  reasons: string[];
  learn: PieceSkill[];
  have: PieceSkill[];
};

export const BAND = { tooEasy: -250, comfortableMax: 50, stretchMax: 200, tooHard: 350 } as const;
/** When the rating is this uncertain the band is widened and a note is shown. */
export const UNCERTAIN_DEVIATION = 250;
const TARGET_DELTA = 100;
const WEIGHTS = { style: 0.4, difficulty: 0.3, skills: 0.3 } as const;
const RECENT_PENALTY = 0.15;

function similarity(a: Candidate, b: Candidate) {
  const genre = a.genre === b.genre ? 1 : 0;
  const ids = new Set(a.skills.map((s) => s.id));
  const union = new Set([...ids, ...b.skills.map((s) => s.id)]);
  const shared = b.skills.filter((s) => ids.has(s.id));
  const skills = union.size ? shared.length / union.size : 0;
  const parts: [number, number][] = [[genre, 0.4], [skills, 0.4]];
  if (a.features && b.features) parts.push([featureSimilarity(a.features, b.features), 0.2]);
  const total = parts.reduce((s, [, w]) => s + w, 0);
  return { value: parts.reduce((s, [v, w]) => s + v * w, 0) / total, genre: genre === 1, shared };
}

function fitFor(delta: number): Fit {
  return delta <= BAND.comfortableMax ? "comfortable" : delta <= BAND.stretchMax ? "stretch" : "challenge";
}

export function recommend(candidates: readonly Candidate[], player: Player, options: { limit?: number } = {}): { recommendations: Recommendation[]; notes: string[] } {
  const notes: string[] = [];
  const uncertain = player.deviation > UNCERTAIN_DEVIATION;
  const widen = uncertain ? 100 : 0;
  if (uncertain) notes.push("Your level rating is still calibrating, so these suggestions may change as it settles.");

  // Private pieces only ever reach their owner.
  const visible = candidates.filter((c) => c.ownerId === null || c.ownerId === player.userId);
  const byId = new Map(visible.map((c) => [c.id, c]));
  const references = [...player.knownPieceIds, ...(player.seedPieceId ? [player.seedPieceId] : [])].map((id) => byId.get(id)).filter((c): c is Candidate => !!c);

  const pool = visible.filter((c) => !player.knownPieceIds.has(c.id) && c.id !== player.seedPieceId);
  const inBand = pool.filter((c) => {
    const d = c.difficultyRating - player.rating;
    return d >= BAND.tooEasy - widen && d <= BAND.tooHard + widen;
  });

  const ranked = inBand.map((piece): Recommendation => {
    const delta = piece.difficultyRating - player.rating;
    const learn = piece.skills.filter((s) => !hasSkill(player.skillLevels[s.id])).sort((a, b) => b.emphasis - a.emphasis);
    const have = piece.skills.filter((s) => hasSkill(player.skillLevels[s.id])).sort((a, b) => b.emphasis - a.emphasis);

    let style = 0;
    let anchor: ReturnType<typeof similarity> | null = null;
    let anchorPiece: Candidate | null = null;
    for (const ref of references) {
      const s = similarity(piece, ref);
      if (s.value > style) { style = s.value; anchor = s; anchorPiece = ref; }
    }
    if (!references.length) style = player.preferredGenre && piece.genre === player.preferredGenre ? 1 : 0.3;

    const difficulty = Math.max(0, 1 - Math.abs(delta - TARGET_DELTA) / 450);
    const skills = Math.min(1, learn.reduce((s, k) => s + k.emphasis, 0) / 6);
    const penalty = player.recentlyRecommendedIds?.has(piece.id) ? RECENT_PENALTY : 0;
    const score = Math.round((style * WEIGHTS.style + difficulty * WEIGHTS.difficulty + skills * WEIGHTS.skills - penalty) * 1000) / 1000;

    const reasons: string[] = [];
    if (anchor && anchorPiece) {
      if (anchor.genre) reasons.push(`Same style as ${anchorPiece.title} (${piece.genre})`);
      if (anchor.shared.length) reasons.push(`Shares ${anchor.shared.slice(0, 3).map((s) => s.name.toLowerCase()).join(", ")} with ${anchorPiece.title}`);
    } else if (!references.length && player.preferredGenre && piece.genre === player.preferredGenre) {
      reasons.push(`Matches the ${piece.genre} style you chose`);
    }
    const fit = fitFor(delta);
    reasons.push(fit === "comfortable" ? "A comfortable fit for your level" : fit === "stretch" ? "A gentle stretch above your level" : "A challenge above your level");
    if (learn.length) reasons.push(`Teaches ${learn.length} skill${learn.length === 1 ? "" : "s"} you are still building`);
    return { piece, fit, score, difficultyDelta: delta, reasons, learn, have };
  });

  ranked.sort((a, b) => b.score - a.score || a.piece.title.localeCompare(b.piece.title));
  const limit = options.limit ?? 5;
  const recommendations = ranked.slice(0, limit);
  if (!pool.length) notes.push("You have already covered every piece in the library, so there is nothing new to suggest yet.");
  else if (!inBand.length) notes.push("No pieces in the library sit close enough to your level right now. The library needs more pieces at this difficulty.");
  else if (inBand.length < limit) notes.push(`Only ${inBand.length} piece${inBand.length === 1 ? "" : "s"} in the library fit your level, because the library is still small.`);
  return { recommendations, notes };
}
