import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  labAuthorized,
  submitSeparation,
  pollSeparation,
  upscaleImage,
} from "../../../../lib/lab";
import { getBalance, refundCredit, spendCredit } from "../../../../lib/credits";
import { bearerEmail } from "../../../../lib/auth";
import { captionImage } from "../../../../lib/ai";

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

    // AI super-resolution first, so separation + packaging inherit real
    // detail. Skipped for already-large inputs; never blocks the run.
    const imgBuf = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
    const [meta, caption] = await Promise.all([
      sharp(imgBuf).metadata().catch(() => ({ width: 0 }) as { width?: number }),
      captionImage(imgBuf),
    ]);
    const width = meta.width || 0;
    let sourceUrl: string | null = null;
    if (width > 0 && width < 2400) {
      const upscaled = await upscaleImage(image, width < 1200 ? 4 : 2);
      if (upscaled) sourceUrl = upscaled.url;
    }

    const { requestId } = await submitSeparation(
      sourceUrl ?? image,
      numLayers,
      caption,
    );

    let balance: number | undefined;
    if (email) {
      balance = (await spendCredit(email, requestId)) ?? 0;
    }
    return NextResponse.json({ requestId, balance, sourceUrl });
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
