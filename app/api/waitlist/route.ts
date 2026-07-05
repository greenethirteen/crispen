import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Real waitlist storage. Emails are appended to a JSON file on disk so the list
// actually persists server-side (the old localStorage version never left the
// visitor's browser). Swap the read/write pair for a DB or an ESP API later —
// the route contract (POST { email, source } / GET { count }) stays the same.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "waitlist.json");

type Entry = { email: string; ts: number; source?: string };

// Reasonable email shape check — deliberately permissive, not RFC-exhaustive.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readAll(): Promise<Entry[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Missing file / bad JSON — start from an empty list.
    return [];
  }
}

async function writeAll(list: Entry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(list, null, 2), "utf8");
}

export async function GET() {
  const list = await readAll();
  return NextResponse.json({ count: list.length });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const raw = (body as { email?: unknown })?.email;
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 422 },
    );
  }

  const sourceRaw = (body as { source?: unknown })?.source;
  const source =
    typeof sourceRaw === "string" ? sourceRaw.slice(0, 40) : undefined;

  const list = await readAll();
  const already = list.some((e) => e.email === email);
  if (!already) {
    list.push({ email, ts: Date.now(), source });
    await writeAll(list);
  }

  return NextResponse.json({ ok: true, already, count: list.length });
}
