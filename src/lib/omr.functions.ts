import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateScore } from "@/lib/score-validation";

export const MAX_PDF_BYTES = 15 * 1024 * 1024;

const convertSchema = z.object({
  title: z.string().trim().min(1).max(120),
  composer: z.string().trim().max(120),
  pdfPath: z.string().max(200),
});

// The browser uploads the PDF to the user's private folder first; this converts it
// to MusicXML and saves it as a normal private user piece. The PDF is always removed.
export const convertPdfScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => convertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.pdfPath.startsWith(`${userId}/`) || data.pdfPath.includes("..") || !data.pdfPath.endsWith(".pdf")) {
      throw new Error("Invalid file.");
    }
    let xmlPath: string | null = null;
    try {
      const { data: pdf, error: dlError } = await supabase.storage.from("scores").download(data.pdfPath);
      if (dlError || !pdf) throw new Error("The PDF could not be read. Please upload it again.");
      if (pdf.size > MAX_PDF_BYTES) throw new Error("The PDF must be smaller than 15 MB.");
      const { convertPdfToMusicXml } = await import("@/lib/omr.server");
      const xml = validateScore(await convertPdfToMusicXml(pdf));
      xmlPath = `${userId}/${crypto.randomUUID()}.musicxml`;
      const { error: upError } = await supabase.storage.from("scores").upload(xmlPath, new Blob([xml], { type: "application/xml" }));
      if (upError) throw new Error("The score could not be saved. Please try again.");
      const { data: piece, error } = await supabase.from("user_pieces")
        .insert({ user_id: userId, title: data.title, composer: data.composer || null, file_path: xmlPath })
        .select("id").single();
      if (error || !piece) {
        await supabase.storage.from("scores").remove([xmlPath]);
        throw new Error("The score could not be saved. Please try again.");
      }
      return { id: piece.id };
    } finally {
      await supabase.storage.from("scores").remove([data.pdfPath]);
    }
  });
