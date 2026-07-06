// Stripe billing config for Crispen credit packs.
// Products live in the Stripe dashboard; these IDs are stable references.
// Checkout/webhook wiring requires STRIPE_SECRET_KEY (Railway env, never committed).

export const CREDIT_PACKS = {
  starter: {
    productId: "prod_UpuwZDomO2qk2N",
    priceId: "price_1TqF6lCE6bX7hMAXG1rKo71S",
    credits: 10,
    amountUsd: 19,
    label: "Starter — 10 conversions",
  },
  studio: {
    productId: "prod_UpuxCup3LzxKEZ",
    priceId: "price_1TqF7LCE6bX7hMAXXVJKd8vN",
    credits: 50,
    amountUsd: 69,
    label: "Studio — 50 conversions",
  },
} as const;

/** Free conversions granted to every new email. */
export const FREE_CREDITS = 3;

export type PackKey = keyof typeof CREDIT_PACKS;
