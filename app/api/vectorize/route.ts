import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import potrace from "potrace";

export const runtime = "nodejs";
// Tracing can take a couple seconds on larger art.
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_TRACE_DIM = 1400; // downscale before tracing; output is vector anyway

function posterize(png: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    potrace.posterize(
      png,
      {
        // A handful of tonal layers keeps flat art readable without exploding
        // the path count. Output is a single-color, multi-opacity trace.
        steps: 4,
        color: "#17161A",
        background: "transparent",
        threshold: potrace.Potrace.THRESHOLD_AUTO,
        // Drop speckle smaller than this many px to keep the SVG clean.
        turdSize: 80,
        optTolerance: 0.4,
      },
      (err: Error | null, svg: string) => {
        if (err) reject(err);
        else resolve(svg);
      },
    );
  });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds the 25 MB limit." },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Normalize to a PNG that potrace/jimp can read (handles WEBP + strips ICC),
    // and cap the working resolution so tracing stays fast.
    let png: Buffer;
    try {
      png = await sharp(buffer)
        .resize(MAX_TRACE_DIM, MAX_TRACE_DIM, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" })
        .png()
        .toBuffer();
    } catch {
      return NextResponse.json(
        { error: "Unsupported or corrupt image file." },
        { status: 422 },
      );
    }

    const svg = await posterize(png);

    return new NextResponse(svg, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
    });
  } catch (err) {
    console.error("[vectorize] failed", err);
    return NextResponse.json(
      { error: "Vector tracing failed unexpectedly." },
      { status: 500 },
    );
  }
}
