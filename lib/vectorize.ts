// Vectorization: vectorizer.ai (pro grade) when credentials are present,
// otherwise the caller falls back to imagetracerjs.

export function vectorizerConfigured(): boolean {
  return Boolean(
    process.env.VECTORIZER_API_ID && process.env.VECTORIZER_API_SECRET,
  );
}

/** Trace a PNG buffer to SVG via vectorizer.ai; null on any failure. */
export async function vectorizeViaApi(png: Buffer): Promise<string | null> {
  if (!vectorizerConfigured()) return null;
  try {
    const auth = Buffer.from(
      `${process.env.VECTORIZER_API_ID}:${process.env.VECTORIZER_API_SECRET}`,
    ).toString("base64");
    const form = new FormData();
    form.append(
      "image",
      new Blob([new Uint8Array(png)], { type: "image/png" }),
      "layer.png",
    );
    form.append("mode", process.env.VECTORIZER_MODE || "production");
    form.append("output.file_format", "svg");
    const res = await fetch("https://vectorizer.ai/api/v1/vectorize", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const svg = await res.text();
    return svg.includes("<svg") ? svg : null;
  } catch {
    return null;
  }
}
