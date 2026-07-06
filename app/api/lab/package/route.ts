import { NextRequest, NextResponse } from "next/server";
import { labAuthorized } from "../../../../lib/lab";
import { bearerEmail } from "../../../../lib/auth";
import { buildPackage } from "../../../../lib/pipeline";

export const runtime = "nodejs";

function dataUriToBuffer(uri: string): Buffer {
  const comma = uri.indexOf(",");
  return Buffer.from(uri.slice(comma + 1), "base64");
}

/**
 * POST { password, original (data URI), layerUrls: string[], widthInches }
 * → application/zip (the production package)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Packaging is free — the credit was spent on the separation step.
    if (!labAuthorized(body?.password) && !(await bearerEmail(req))) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }
    const originalUri = typeof body?.original === "string" ? body.original : "";
    if (!originalUri.startsWith("data:image/")) {
      return NextResponse.json({ error: "Send a data-URI original" }, { status: 400 });
    }
    const layerUrls: string[] = Array.isArray(body?.layerUrls)
      ? body.layerUrls.filter((u: unknown) => typeof u === "string")
      : [];
    if (layerUrls.length === 0) {
      return NextResponse.json({ error: "No layer URLs" }, { status: 400 });
    }
    const widthInches = Math.min(60, Math.max(1, Number(body?.widthInches) || 12));

    const layers = await Promise.all(
      layerUrls.map(async (url, i) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Layer ${i + 1} fetch failed (${res.status})`);
        return {
          name: `layer-${i + 1}`,
          data: Buffer.from(await res.arrayBuffer()),
        };
      }),
    );

    const result = await buildPackage({
      original: dataUriToBuffer(originalUri),
      layers,
      targetWidthInches: widthInches,
    });

    return new NextResponse(new Uint8Array(result.zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="production-package.zip"',
        "X-Artwork-Size": `${result.widthIn.toFixed(2)}x${result.heightIn.toFixed(2)}in@300dpi`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
