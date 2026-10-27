import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";

export const uploadScoreSchema = z.object({
  title: z.string().trim().min(1).max(120),
  composer: z.string().trim().max(120),
  xml: z.string().min(1).max(5242880),
});

export function validateScore(xml: string) {
  if (new TextEncoder().encode(xml).length > 5242880) throw new Error("The score must be smaller than 5 MB.");
  // No DTD/entity expansion or external resources in user files.
  const clean = xml.replace(/<!DOCTYPE[^>]*(?:\[[\s\S]*?\]\s*)?>/gi, "");
  if (/<!ENTITY|<script|<iframe/i.test(clean)) throw new Error("This file contains unsupported content.");
  if (XMLValidator.validate(clean) !== true) throw new Error("This is not a valid XML file.");
  const parsed = new XMLParser({ processEntities: false }).parse(clean);
  if (!parsed["score-partwise"]?.part) throw new Error("Choose an uncompressed, partwise MusicXML score (.xml or .musicxml).");
  return clean;
}