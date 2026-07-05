import { NextRequest, NextResponse } from "next/server";
import { labAuthorized, submitSeparation, pollSeparation } from "../../../../lib/lab";

export const runtime = "nodejs";

/** POST { password, image (data URI), numLayers? } → { requestId } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!labAuthorized(body?.password)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const image = typeof body?.image === "string" ? body.image : "";
    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ error: "Send a data-URI image" }, { status: 400 });
    }
    const numLayers = Math.min(8, Math.max(2, Number(body?.numLayers) || 4));
    const { requestId } = await submitSeparation(image, numLayers);
    return NextResponse.json({ requestId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET ?id=…&password=… → status / layers */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    if (!labAuthorized(searchParams.get("password"))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const status = await pollSeparation(id);
    return NextResponse.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
