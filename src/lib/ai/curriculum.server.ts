import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, Output, streamText, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./run-id";
import type { WeeklyPlan } from "@/lib/data";

const MODEL = "openai/gpt-6-astra";
const BASE_URL = "https://ai.gateway.lovable.dev/v1";

const item = { type: "object", additionalProperties: false, required: ["title", "details"], properties: { title: { type: "string" }, details: { type: "string" } } };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["weekTheme", "days"],
  properties: {
    weekTheme: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "focus", "warmup", "drills", "pieceId", "practiceSteps", "checklist"],
        properties: {
          day: { type: "string" },
          focus: { type: "string" },
          warmup: item,
          drills: { type: "array", items: item },
          pieceId: { type: "string" },
          practiceSteps: {
            type: "array",
            items: { type: "object", additionalProperties: false, required: ["step", "tempo"], properties: { step: { type: "string" }, tempo: { type: "string" } } },
          },
          checklist: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export type CurriculumInput = {
  profile: { genre: string | null; proficiency: string | null; goal: string | null; daily_minutes: number | null };
  pieces: { id: string; title: string; composer: string; genre: string; difficulty: string; key_signature: string }[];
};

export async function generateWeeklyPlan(apiKey: string, input: CurriculumInput): Promise<WeeklyPlan> {
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: BASE_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const library = input.pieces
    .map((p) => `- id=${p.id} | ${p.title} — ${p.composer} | ${p.genre} | ${p.difficulty} | ${p.key_signature}`)
    .join("\n");

  const instructions = `You are KeyCoach, an expert piano teacher for intermediate pianists (ABRSM Grades 4-6).
Create a 7-day practice plan. Rules:
- Exactly 7 days, labelled "Day 1".."Day 7".
- Warm-up: scales/arpeggios suited to the student's genre and level, with keys, hands and metronome targets.
- 2-3 technical drills per day.
- pieceId MUST be copied exactly from the library list below. Never invent pieces. Prefer pieces matching genre and level; you may revisit the same piece across days to build mastery.
- practiceSteps: 4-6 concrete steps (hands separate, slow tempo, chunking, looping hard bars, gradual metronome increases). tempo is a short string like "♩=60" or "—".
- checklist: 4-6 short tickable items covering the whole session.
- Fit the session into the student's daily minutes. Keep text concise and encouraging.

LIBRARY:
${library}`;

  const result = streamText({
    model: provider.responses(MODEL),
    instructions,
    messages: [
      {
        role: "user",
        content: `Student profile — genre: ${input.profile.genre}; level: ${input.profile.proficiency}; goal: ${input.profile.goal}; daily practice: ${input.profile.daily_minutes} minutes.`,
      },
    ],
    output: Output.object({ schema: jsonSchema<WeeklyPlan>(schema as never) }),
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  let plan: WeeklyPlan;
  try {
    plan = (await result.output) as WeeklyPlan;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new Error("The coach returned an unreadable plan. Please try again.");
    throw e;
  }

  // Guarantee every piece exists in the library.
  const ids = new Set(input.pieces.map((p) => p.id));
  const fallback = input.pieces[0]?.id;
  plan.days = plan.days.slice(0, 7).map((d) => ({ ...d, pieceId: ids.has(d.pieceId) ? d.pieceId : (fallback ?? d.pieceId) }));
  return plan;
}
