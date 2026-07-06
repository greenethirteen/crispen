import { NextRequest, NextResponse } from "next/server";
import { getBalance } from "../../../../lib/credits";
import { bearerEmail } from "../../../../lib/auth";

export const runtime = "nodejs";

/** GET → { balance } for the signed-in user (grants free credits on first sight) */
export async function GET(req: NextRequest) {
  const email = await bearerEmail(req);
  if (!email) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  return NextResponse.json({ balance: await getBalance(email) });
}
