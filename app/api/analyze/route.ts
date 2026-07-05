import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import type { AnalyzeResponse, ImageMeta } from "@/lib/types";

// Analysis needs the Node runtime (sharp is a native module).
export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB guard for an MVP tool

/**
 * Estimate whether an image is "flat" enough to trace to vector by counting
 * the number of distinct colors in a downsampled thumbnail. Photographs and
 * gradients explode into thousands of colors; logos and flat illustrations
 * stay in the low hundreds.
 */
async function estimateColorComplexity(
  input: Buffer,
): Promise<{ vectorizable: boolean; reason: string; uniqueColors: number }> {
  const { data, info } = await sharp(input)
    .resize(96, 96, { fit: "inside" })
    .flatten({ background: "#ffffff" }) // drop alpha for a stable count
    .raw()
    .toBuffer({ resolveWithObject: true });

  const seen = new Set<number>();
  const step = info.channels;
  for (let i = 0; i + 2 < data.length; i += step) {
    // Quantize to 4 bits per channel to ignore JPEG/anti-alias noise.
    const r = data[i] >> 4;
    const g = data[i + 1] >> 4;
    const b = data[i + 2] >> 4;
    seen.add((r << 8) | (g << 4) | b);
    if (seen.size > 512) break; // early out; already too complex
  }

  const uniqueColors = seen.size;
  if (uniqueColors <= 64) {
    return {
      vectorizable: true,
      reason: `Flat artwork detected (~${uniqueColors} tones). Good candidate for tracing.`,
      uniqueColors,
    };
  }
  if (uniqueColors <= 160) {
    return {
      vectorizable: true,
      reason: `Moderately flat (~${uniqueColors} tones). Trace may lose fine detail.`,
      uniqueColors,
    };
  }
  return {
    vectorizable: false,
    reason: `Too many tones (>${uniqueColors === 513 ? "512" : uniqueColors}) — looks like a photo or gradient. Tracing would produce garbage.`,
    uniqueColors,
  };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds the 25 MB limit." },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let sharpMeta;
    try {
      sharpMeta = await sharp(buffer).metadata();
    } catch {
      return NextResponse.json(
        { error: "Unsupported or corrupt image file." },
        { status: 422 },
      );
    }

    if (!sharpMeta.width || !sharpMeta.height) {
      return NextResponse.json(
        { error: "Could not read image dimensions." },
        { status: 422 },
      );
    }

    const meta: ImageMeta = {
      fileName: file.name,
      fileSizeBytes: file.size,
      format: sharpMeta.format ?? "unknown",
      width: sharpMeta.width,
      height: sharpMeta.height,
      hasAlpha: Boolean(sharpMeta.hasAlpha),
      colorSpace: sharpMeta.space ?? "unknown",
      channels: sharpMeta.channels ?? 0,
      // sharp reports density in DPI when present. AI exporters often stamp 72.
      density:
        typeof sharpMeta.density === "number" && sharpMeta.density > 0
          ? sharpMeta.density
          : null,
    };

    const complexity = await estimateColorComplexity(buffer);

    const payload: AnalyzeResponse = {
      meta,
      vectorizable: complexity.vectorizable,
      vectorizableReason: complexity.reason,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[analyze] failed", err);
    return NextResponse.json(
      { error: "Analysis failed unexpectedly." },
      { status: 500 },
    );
  }
}
