import { NextRequest, NextResponse } from "next/server";
import { labAuthorized, submitSeparation, pollSeparation } from "../../../../lib/lab";
import { getBalance, refundCredit, spendCredit } from "../../../../lib/credits";
import { bearerEmail } from "../../../../lib/auth";

export const runtime = "nodejs";

/**
 * POST { password?, image (data URI), numLayers? } → { requestId, balance? }
 * Admin password runs free; otherwise the signed-in user pays 1 credit.
 * Identity comes from the verified Firebase ID token — never from the body.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const isAdmin = labAuthorized(body?.password);
    const email = isAdmin ? null : await bearerEmail(req);
    if (!isAdmin && !email) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }
    const image = typeof body?.image === "string" ? body.image : "";
    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ error: "Send a data-URI image" }, { status: 400 });
    }
    if (email && (await getBalance(email)) < 1) {
      return NextResponse.json(
        { error: "no_credits", balance: 0 },
        { status: 402 },
      );
    }

    const numLayers = Math.min(8, Math.max(2, Number(body?.numLayers) || 4));
    const { requestId } = await submitSeparation(image, numLayers);

    let balance: number | undefined;
    if (email) {
      balance = (await spendCredit(email, requestId)) ?? 0;
    }
    return NextResponse.json({ requestId, balance });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET ?id=…[&password=…] → status / layers. Failed runs refund. */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const authorized =
      labAuthorized(searchParams.get("password")) ||
      (await bearerEmail(req)) !== null;
    if (!authorized) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const status = await pollSeparation(id);
    if (status.status === "FAILED") {
      await refundCredit(id);
    }
    return NextResponse.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
