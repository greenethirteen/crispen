// Stripe billing config for Crispen credit packs.
// Products live in the Stripe dashboard; these IDs are stable references.
// Checkout/webhook wiring requires STRIPE_SECRET_KEY (Railway env, never committed).

export const CREDIT_PACKS = {
  starter: {
    productId: "prod_UpuwZDomO2qk2N",
    credits: 10,
    label: "Starter — 10 conversions",
  },
  studio: {
    productId: "prod_UpuxCup3LzxKEZ",
    credits: 50,
    label: "Studio — 50 conversions",
  },
} as const;

export type PackKey = keyof typeof CREDIT_PACKS;
