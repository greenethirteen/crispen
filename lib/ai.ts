// Optional Claude-powered smarts. Everything here degrades gracefully:
// no ANTHROPIC_API_KEY (or any failure) → callers fall back to heuristics.

const MODEL = "claude-haiku-4-5-20251001";

function key(): string | null {
  return process.env.ANTHROPIC_API_KEY || null;
}

async function claude(
  content: unknown[],
  maxTokens: number,
): Promise<string | null> {
  const apiKey = key();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

const img = (base64: string) => ({
  type: "image",
  source: { type: "base64", media_type: "image/png", data: base64 },
});

/** One-line caption of the artwork, used to guide layer decomposition. */
export async function captionImage(png: Buffer): Promise<string | null> {
  const text = await claude(
    [
      img(png.toString("base64")),
      {
        type: "text",
        text: "Describe this image in one short sentence (max 20 words) for an image-decomposition model. Only the sentence, nothing else.",
      },
    ],
    80,
  );
  return text?.trim().slice(0, 200) ?? null;
}

export interface LayerAnalysis {
  names: string[];
  notes: string[];
}

/**
 * Name each layer (2-3 word, lowercase, filesystem-safe) and surface any
 * print-relevant warnings. `layers` are small PNG previews, bottom→top.
 */
export async function analyzeLayers(
  original: Buffer,
  layers: Buffer[],
): Promise<LayerAnalysis | null> {
  const content: unknown[] = [
    { type: "text", text: "Full artwork:" },
    img(original.toString("base64")),
  ];
  layers.forEach((l, i) => {
    content.push({ type: "text", text: `Layer ${i + 1} (bottom to top):` });
    content.push(img(l.toString("base64")));
  });
  content.push({
    type: "text",
    text: `Return strict JSON only, no prose:
{"names": [one 1-3 word lowercase kebab-case name per layer, in order, e.g. "background", "chip-bag", "label-artwork", "shadows"],
 "notes": [0-3 short print-production warnings about this artwork, e.g. AI-garbled text to proofread, very saturated colours that will shift in CMYK; empty array if nothing notable]}`,
  });
  const text = await claude(content, 400);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!Array.isArray(parsed.names) || parsed.names.length !== layers.length) {
      return null;
    }
    const clean = (s: unknown) =>
      String(s)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24) || "layer";
    return {
      names: parsed.names.map(clean),
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.map((n: unknown) => String(n).slice(0, 160)).slice(0, 3)
        : [],
    };
  } catch {
    return null;
  }
}
