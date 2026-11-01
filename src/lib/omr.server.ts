// Server-only: calls the self-hosted Audiveris service (see /omr-service).
export async function convertPdfToMusicXml(pdf: Blob): Promise<string> {
  const base = process.env["OMR_SERVICE_URL"];
  const token = process.env["OMR_SERVICE_TOKEN"];
  if (!base || !token) throw new Error("PDF conversion is not configured yet.");
  let res: Response;
  try {
    res = await fetch(new URL("/omr", base), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf" },
      body: pdf,
      signal: AbortSignal.timeout(180_000),
    });
  } catch {
    throw new Error("The conversion service did not respond. Please try again.");
  }
  if (res.status === 422) throw new Error("We couldn't read notation from this PDF. Try a clean, typeset score.");
  if (!res.ok) throw new Error("The conversion failed. Please try again.");
  return await res.text();
}
