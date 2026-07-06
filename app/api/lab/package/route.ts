import { NextRequest, NextResponse } from "next/server";
import { labAuthorized } from "../../../../lib/lab";
import { bearerEmail } from "../../../../lib/auth";
import { buildPackage } from "../../../../lib/pipeline";
import { saveJob } from "../../../../lib/jobs";

export const runtime = "nodejs";

function dataUriToBuffer(uri: string): Buffer {
  const comma = uri.indexOf(",");
  return Buffer.from(uri.slice(comma + 1), "base64");
}

/**
 * POST { password?, original (data URI), layerUrls: string[], widthInches }
 * → JSON { id, downloadUrl, sizeBytes, report, layerNames, vectorCount, … }
 * The zip itself is persisted on the volume; download is a separate GET.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const isAdmin = labAuthorized(body?.password);
    const email = isAdmin ? null : await bearerEmail(req);
    // Packaging is free — the credit was spent on the separation step.
    if (!isAdmin && !email) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }
    // Prefer the AI-upscaled source (hosted URL from the separate step);
    // fall back to the client's original data URI.
    const originalUrl = typeof body?.originalUrl === "string" ? body.originalUrl : "";
    const originalUri = typeof body?.original === "string" ? body.original : "";
    let original: Buffer;
    if (originalUrl.startsWith("https://")) {
      const res = await fetch(originalUrl);
      if (!res.ok) {
        return NextResponse.json({ error: "Source fetch failed" }, { status: 502 });
      }
      original = Buffer.from(await res.arrayBuffer());
    } else if (originalUri.startsWith("data:image/")) {
      original = dataUriToBuffer(originalUri);
    } else {
      return NextResponse.json({ error: "Send an original" }, { status: 400 });
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
      original,
      layers,
      targetWidthInches: widthInches,
    });

    const record = await saveJob(email ?? "__admin__", result.zip, {
      widthIn: result.widthIn,
      heightIn: result.heightIn,
      layerNames: result.layerNames,
      vectorCount: result.vectorCount,
      report: result.report,
    });

    return NextResponse.json({
      id: record.id,
      downloadUrl: `/api/lab/download?id=${record.id}`,
      sizeBytes: record.sizeBytes,
      widthIn: result.widthIn,
      heightIn: result.heightIn,
      layerNames: result.layerNames,
      vectorCount: result.vectorCount,
      recompositeError: result.recompositeError,
      report: result.report,
      notes: result.notes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
