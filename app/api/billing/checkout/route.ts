import { NextRequest, NextResponse } from "next/server";
import { CREDIT_PACKS, PackKey } from "../../../../lib/billing";
import { createCheckoutSession } from "../../../../lib/stripe";
import { bearerEmail } from "../../../../lib/auth";
import { logCheckout } from "../../../../lib/credits";

export const runtime = "nodejs";

/** POST { pack: "starter" | "studio" } → { url }. Buyer = signed-in user. */
export async function POST(req: NextRequest) {
  try {
    const email = await bearerEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }
    const body = await req.json();
    const pack = CREDIT_PACKS[body?.pack as PackKey];
    if (!pack) {
      return NextResponse.json({ error: "Unknown pack" }, { status: 400 });
    }
    let url: string;
    try {
      url = await createCheckoutSession({
        priceId: pack.priceId,
        email,
        credits: pack.credits,
        pack: body.pack,
        baseUrl: new URL(req.url).origin,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      await logCheckout({ email, pack: body.pack, ok: false, error });
      throw err;
    }
    await logCheckout({ email, pack: body.pack, ok: true });
    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
