import { NextRequest, NextResponse } from "next/server";
import { addPurchasedCredits, normalizeEmail } from "../../../../lib/credits";
import { verifyWebhook } from "../../../../lib/stripe";

export const runtime = "nodejs";

/** Stripe webhook: checkout.session.completed → credit the buyer. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const event = verifyWebhook(rawBody, req.headers.get("stripe-signature"));
  if (!event) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id: string;
      payment_status?: string;
      metadata?: { email?: string; credits?: string };
      customer_details?: { email?: string };
    };
    if (session.payment_status === "paid") {
      const email =
        normalizeEmail(session.metadata?.email) ??
        normalizeEmail(session.customer_details?.email);
      const credits = Number(session.metadata?.credits) || 0;
      if (email && credits > 0) {
        await addPurchasedCredits(email, credits, session.id);
      }
    }
  }

  return NextResponse.json({ received: true });
}
