import { describe, expect, it } from "vitest";
import { recommend, type Candidate, type Player, type PieceSkill } from "@/lib/recommend";

const skill = (id: string, emphasis = 2): PieceSkill => ({ id, name: id.replace(/-/g, " "), category: "technique", emphasis, note: `${id} note` });
const piece = (id: string, genre: string, difficultyRating: number, skills: PieceSkill[], ownerId: string | null = null): Candidate =>
  ({ id, title: `Piece ${id}`, composer: "Composer", genre, difficultyLabel: "x", difficultyRating, skills, ownerId });
const player = (over: Partial<Player> = {}): Player => ({ userId: "me", rating: 1300, deviation: 100, skillLevels: {}, knownPieceIds: new Set(), ...over });

const LIB = [
  piece("easy", "Classical", 900, [skill("legato")]),
  piece("near", "Classical", 1350, [skill("legato"), skill("pedalling")]),
  piece("stretch", "Classical", 1450, [skill("ornaments", 3)]),
  piece("jazz", "Jazz", 1400, [skill("syncopation", 3), skill("swing")]),
  piece("hard", "Classical", 2000, [skill("octaves")]),
];

describe("difficulty band", () => {
  it("drops pieces that are far too easy or far too hard", () => {
    const ids = recommend(LIB, player()).recommendations.map((r) => r.piece.id);
    expect(ids).not.toContain("easy");
    expect(ids).not.toContain("hard");
    expect(ids).toContain("near");
  });
  it("labels fit by distance above the player's rating", () => {
    const fits = Object.fromEntries(recommend(LIB, player()).recommendations.map((r) => [r.piece.id, r.fit]));
    expect(fits.near).toBe("comfortable");
    expect(fits.stretch).toBe("stretch");
  });
  it("widens the band and says so when the rating is uncertain", () => {
    const certain = recommend(LIB, player({ rating: 1000 })).recommendations.map((r) => r.piece.id);
    const unsure = recommend(LIB, player({ rating: 1000, deviation: 340 }));
    expect(unsure.recommendations.length).toBeGreaterThanOrEqual(certain.length);
    expect(unsure.notes.join(" ")).toContain("calibrating");
  });
});

describe("style similarity", () => {
  it("prefers pieces like the one the player knows", () => {
    const known = piece("known", "Jazz", 1300, [skill("syncopation", 3)]);
    const out = recommend([...LIB, known], player({ knownPieceIds: new Set(["known"]) }));
    expect(out.recommendations[0]!.piece.id).toBe("jazz");
    expect(out.recommendations[0]!.reasons.join(" ")).toContain("Piece known");
  });
  it("uses the preferred genre when nothing else is known", () => {
    expect(recommend(LIB, player({ preferredGenre: "Jazz" })).recommendations[0]!.piece.id).toBe("jazz");
  });
  it("'more like this' anchors on the seed and excludes it", () => {
    const out = recommend(LIB, player({ seedPieceId: "jazz", rating: 1400 }));
    expect(out.recommendations.map((r) => r.piece.id)).not.toContain("jazz");
  });
});

describe("what the player already knows", () => {
  it("never recommends a piece the player can already play", () => {
    const out = recommend(LIB, player({ knownPieceIds: new Set(["near"]) }));
    expect(out.recommendations.map((r) => r.piece.id)).not.toContain("near");
  });
  it("lists only skills the player lacks under 'learn' and the rest under 'have'", () => {
    const out = recommend(LIB, player({ skillLevels: { legato: 2, pedalling: 1 } }));
    const near = out.recommendations.find((r) => r.piece.id === "near")!;
    expect(near.learn.map((s) => s.id)).toEqual(["pedalling"]);
    expect(near.have.map((s) => s.id)).toEqual(["legato"]);
  });
  it("carries the passage note for each skill to learn", () => {
    const near = recommend(LIB, player()).recommendations.find((r) => r.piece.id === "near")!;
    expect(near.learn.every((s) => s.note.length > 0)).toBe(true);
  });
});

describe("private pieces", () => {
  const mine = piece("mine", "Classical", 1350, [skill("legato")], "me");
  const theirs = piece("theirs", "Classical", 1350, [skill("legato")], "someone-else");
  it("appear for their owner only", () => {
    const ids = recommend([...LIB, mine, theirs], player()).recommendations.map((r) => r.piece.id);
    expect(ids).toContain("mine");
    expect(ids).not.toContain("theirs");
  });
});

describe("thin libraries", () => {
  it("handles an empty catalog", () => {
    const out = recommend([], player());
    expect(out.recommendations).toEqual([]);
    expect(out.notes.length).toBeGreaterThan(0);
  });
  it("says so when few pieces fit", () => {
    expect(recommend(LIB, player()).notes.join(" ")).toContain("library");
  });
  it("respects the limit", () => {
    expect(recommend(LIB, player(), { limit: 1 }).recommendations).toHaveLength(1);
  });
  it("ranks recently shown pieces lower", () => {
    const base = recommend(LIB, player()).recommendations.map((r) => r.piece.id);
    const shifted = recommend(LIB, player({ recentlyRecommendedIds: new Set([base[0]!]) })).recommendations.map((r) => r.piece.id);
    expect(shifted[0]).not.toBe(base[0]);
  });
});
