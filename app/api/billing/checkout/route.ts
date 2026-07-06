import { NextRequest, NextResponse } from "next/server";
import { CREDIT_PACKS, PackKey } from "../../../../lib/billing";
import { normalizeEmail } from "../../../../lib/credits";
import { createCheckoutSession } from "../../../../lib/stripe";

export const runtime = "nodejs";

/** POST { email, pack: "starter" | "studio" } → { url } (Stripe Checkout) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(body?.email);
    if (!email) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    const pack = CREDIT_PACKS[body?.pack as PackKey];
    if (!pack) {
      return NextResponse.json({ error: "Unknown pack" }, { status: 400 });
    }
    const url = await createCheckoutSession({
      priceId: pack.priceId,
      email,
      credits: pack.credits,
      pack: body.pack,
      baseUrl: new URL(req.url).origin,
    });
    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
