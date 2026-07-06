// Credit ledger, file-backed on the Railway volume (same pattern as the
// waitlist). Single-instance service, so plain fs read/write is fine.

import { promises as fs } from "fs";
import path from "path";
import { FREE_CREDITS } from "./billing";

const FILE = path.join(process.cwd(), ".data", "credits.json");

interface Ledger {
  emails: Record<
    string,
    { balance: number; freeGranted: boolean; purchased: number }
  >;
  /** fal requestId → who paid, so a failed separation can refund once. */
  pending: Record<string, { email: string; refunded: boolean }>;
  /** Stripe checkout session ids already credited (webhook idempotency). */
  processedSessions: string[];
}

const EMPTY: Ledger = { emails: {}, pending: {}, processedSessions: [] };

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function load(): Promise<Ledger> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, "utf8"));
    return { ...EMPTY, ...parsed };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function save(ledger: Ledger): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(ledger, null, 2));
}

function ensure(ledger: Ledger, email: string) {
  if (!ledger.emails[email]) {
    ledger.emails[email] = {
      balance: FREE_CREDITS,
      freeGranted: true,
      purchased: 0,
    };
  }
  return ledger.emails[email];
}

export async function getBalance(email: string): Promise<number> {
  const ledger = await load();
  ensure(ledger, email);
  await save(ledger);
  return ledger.emails[email].balance;
}

/** Spend 1 credit for a separation; returns new balance or null if broke. */
export async function spendCredit(
  email: string,
  requestId: string,
): Promise<number | null> {
  const ledger = await load();
  const acct = ensure(ledger, email);
  if (acct.balance < 1) {
    await save(ledger);
    return null;
  }
  acct.balance -= 1;
  ledger.pending[requestId] = { email, refunded: false };
  await save(ledger);
  return acct.balance;
}

/** Refund the credit for a failed separation (idempotent per requestId). */
export async function refundCredit(requestId: string): Promise<void> {
  const ledger = await load();
  const pending = ledger.pending[requestId];
  if (!pending || pending.refunded) return;
  pending.refunded = true;
  ensure(ledger, pending.email).balance += 1;
  await save(ledger);
}

/** Add purchased credits (idempotent per checkout session). */
export async function addPurchasedCredits(
  email: string,
  credits: number,
  sessionId: string,
): Promise<void> {
  const ledger = await load();
  if (ledger.processedSessions.includes(sessionId)) return;
  ledger.processedSessions.push(sessionId);
  const acct = ensure(ledger, email);
  acct.balance += credits;
  acct.purchased += credits;
  await save(ledger);
}
