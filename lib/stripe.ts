// Minimal Stripe REST client: hosted Checkout creation + webhook signature
// verification. No SDK — two endpoints don't justify the dependency.

import { createHmac, timingSafeEqual } from "crypto";

function stripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return key;
}

/** Create a hosted Checkout session; returns the URL to redirect the user to. */
export async function createCheckoutSession(opts: {
  priceId: string;
  email: string;
  credits: number;
  pack: string;
  baseUrl: string;
}): Promise<string> {
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": "1",
    customer_email: opts.email,
    "metadata[email]": opts.email,
    "metadata[credits]": String(opts.credits),
    "metadata[pack]": opts.pack,
    success_url: `${opts.baseUrl}/lab?paid=success`,
    cancel_url: `${opts.baseUrl}/lab?paid=cancel`,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${stripeKey()}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe checkout failed (${res.status}): ${json?.error?.message}`);
  }
  return json.url as string;
}

/**
 * Verify a Stripe webhook signature (Stripe-Signature: t=…,v1=…).
 * Returns the parsed event on success, null on any failure.
 */
export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | null,
): { type: string; data: { object: Record<string, unknown> } } | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return null;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => kv.split("=", 2) as [string, string]),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return null;

  // Reject stale events (5 min tolerance).
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return null;

  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}
