import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { uploadScoreSchema, validateScore } from "@/lib/score-validation";

export const uploadScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadScoreSchema.parse(input))
  .handler(async ({ data, context }) => {
    const xml = validateScore(data.xml);
    const path = `${context.userId}/${crypto.randomUUID()}.musicxml`;
    const { error: storageError } = await context.supabase.storage.from("scores").upload(path, new Blob([xml], { type: "application/xml" }));
    if (storageError) throw new Error("The score could not be uploaded. Please try again.");
    const { data: piece, error } = await context.supabase.from("user_pieces").insert({ user_id: context.userId, title: data.title, composer: data.composer || null, file_path: path }).select("id").single();
    if (error || !piece) {
      await context.supabase.storage.from("scores").remove([path]);
      throw new Error("The score could not be saved. Please try again.");
    }
    return { id: piece.id };
  });