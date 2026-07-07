import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Admin read endpoint: returns the full waitlist, but only when the correct
// password is posted. The check runs server-side so the list is never shipped
// to the browser unless the caller is authenticated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), ".data", "waitlist.json");

// Defaults to 1059, overridable without a code change by setting ADMIN_PASSWORD
// in Railway (recommended if the repo is public).
const PASSWORD = process.env.ADMIN_PASSWORD || "1059";

type Entry = { email: string; ts: number; source?: string };

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const password = String((body as { password?: unknown })?.password ?? "");
  if (password !== PASSWORD) {
    return NextResponse.json(
      { ok: false, error: "Wrong password." },
      { status: 401 },
    );
  }

  let entries: Entry[] = [];
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) entries = parsed;
  } catch {
    // No file yet — empty list.
  }

  // Newest first.
  entries.sort((a, b) => (b?.ts ?? 0) - (a?.ts ?? 0));

  // Product usage: signed-up users (credit ledger) and conversions (jobs).
  let users: { email: string; balance: number; purchased: number }[] = [];
  let conversions: { owner: string; createdAt: string; sizeBytes: number }[] = [];
  try {
    const credits = JSON.parse(
      await fs.readFile(path.join(process.cwd(), ".data", "credits.json"), "utf8"),
    );
    users = Object.entries(credits.emails ?? {}).map(([email, v]) => ({
      email,
      balance: (v as { balance: number }).balance,
      purchased: (v as { purchased: number }).purchased,
    }));
  } catch {
    /* no ledger yet */
  }
  try {
    const jobs = JSON.parse(
      await fs.readFile(path.join(process.cwd(), ".data", "jobs.json"), "utf8"),
    );
    conversions = Object.values(jobs.jobs ?? {})
      .map((j) => {
        const job = j as { owner: string; createdAt: string; sizeBytes: number };
        return {
          owner: job.owner,
          createdAt: job.createdAt,
          sizeBytes: job.sizeBytes,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    /* no jobs yet */
  }

  return NextResponse.json({
    ok: true,
    count: entries.length,
    entries,
    users,
    conversions,
  });
}
