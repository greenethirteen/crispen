import { NextRequest, NextResponse } from "next/server";
import { labAuthorized } from "../../../../lib/lab";
import { bearerEmail } from "../../../../lib/auth";
import { listJobs } from "../../../../lib/jobs";

export const runtime = "nodejs";

/** GET → the signed-in user's past conversions (admin: ?password=…). */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const owner = labAuthorized(searchParams.get("password"))
      ? "__admin__"
      : await bearerEmail(req);
    if (!owner) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }
    const jobs = await listJobs(owner);
    return NextResponse.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        createdAt: j.createdAt,
        sizeBytes: j.sizeBytes,
        widthIn: j.widthIn,
        heightIn: j.heightIn,
        layerNames: j.layerNames,
        vectorCount: j.vectorCount,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
