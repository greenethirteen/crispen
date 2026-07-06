import { NextRequest, NextResponse } from "next/server";
import { getBalance, normalizeEmail } from "../../../../lib/credits";

export const runtime = "nodejs";

/** GET ?email=… → { balance } (grants the free credits on first sight) */
export async function GET(req: NextRequest) {
  const email = normalizeEmail(new URL(req.url).searchParams.get("email"));
  if (!email) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  return NextResponse.json({ balance: await getBalance(email) });
}
