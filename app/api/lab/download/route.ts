import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { labAuthorized } from "../../../../lib/lab";
import { bearerEmail } from "../../../../lib/auth";
import { getJob } from "../../../../lib/jobs";

export const runtime = "nodejs";

/** GET ?id=… → the persisted production package (owner or admin only). */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const isAdmin = labAuthorized(searchParams.get("password"));
    const email = await bearerEmail(req);
    if (!isAdmin && job.record.owner !== email) {
      return NextResponse.json({ error: "Not yours" }, { status: 403 });
    }
    const data = await fs.readFile(job.file);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="production-package.zip"',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
