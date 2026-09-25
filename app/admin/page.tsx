"use client";

import { useState } from "react";

type Entry = { email: string; ts: number; source?: string };
type User = { email: string; balance: number; purchased: number };
type Conversion = { owner: string; createdAt: string; sizeBytes: number };
type Payment = {
  sessionId: string;
  email: string;
  credits: number;
  pack?: string;
  amountCents?: number;
  currency?: string;
  ts: number;
};
type Checkout = { email: string; pack: string; ok: boolean; error?: string; ts: number };
type Data = {
  entries: Entry[];
  users: User[];
  conversions: Conversion[];
  payments: Payment[];
  checkouts: Checkout[];
  legacySessions: number;
  creditsSpent: number;
  creditsRefunded: number;
};

const TABS = ["payments", "checkouts", "users", "conversions", "waitlist"] as const;
type Tab = (typeof TABS)[number];

const when = (ts: number | string) => (ts ? new Date(ts).toLocaleString() : "—");
const money = (cents?: number, cur?: string) =>
  cents == null
    ? "—"
    : (cents / 100).toLocaleString(undefined, {
        style: "currency",
        currency: (cur ?? "usd").toUpperCase(),
      });

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("payments");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Wrong password.");
        setData(null);
      } else {
        setData(json as Data);
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    if (!data?.entries.length) return;
    try {
      await navigator.clipboard.writeText(data.entries.map((e) => e.email).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const signOut = () => {
    setData(null);
    setPassword("");
  };

  const revenue = (data?.payments ?? []).reduce((n, p) => n + (p.amountCents ?? 0), 0);
  const payers = new Set((data?.users ?? []).filter((u) => u.purchased > 0).map((u) => u.email));
  const failedCheckouts = (data?.checkouts ?? []).filter((c) => !c.ok).length;
  const userConversions = (data?.conversions ?? []).filter((c) => c.owner !== "__admin__");

  const stats: [string, string | number][] = data
    ? [
        ["Revenue (logged)", money(revenue, data.payments[0]?.currency)],
        ["Payments", data.payments.length + data.legacySessions],
        ["Paying users", payers.size],
        ["Failed checkouts", failedCheckouts],
        ["Users", data.users.length],
        ["Conversions (users)", userConversions.length],
        ["Credits spent / refunded", `${data.creditsSpent} / ${data.creditsRefunded}`],
        ["Waitlist", data.entries.length],
      ]
    : [];

  const table = (cols: string[], rows: React.ReactNode[][], empty: string) =>
    rows.length === 0 ? (
      <div className="empty">{empty}</div>
    ) : (
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className={j === 0 ? "email" : "when"}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="admin">
      {data === null ? (
        <form className="gate" onSubmit={submit}>
          <h1>Crispen admin</h1>
          <p className="muted">Enter the password to view payments, users and the waitlist.</p>
          <input
            type="password"
            inputMode="numeric"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            aria-label="Admin password"
          />
          <button type="submit" disabled={busy}>
            {busy ? "Checking…" : "Open dashboard"}
          </button>
          {error ? <div className="err">{error}</div> : null}
        </form>
      ) : (
        <div className="dash">
          <div className="dash-head">
            <div>
              <h1>Crispen admin</h1>
              <p className="muted">
                Payments come from our own webhook log, so they show here even when the
                Stripe dashboard isn&apos;t reachable.
              </p>
            </div>
            <div className="actions">
              {tab === "waitlist" ? (
                <button onClick={copyAll} disabled={!data.entries.length}>
                  {copied ? "Copied ✓" : "Copy all emails"}
                </button>
              ) : null}
              <button className="ghost" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>

          <div className="stats">
            {stats.map(([label, value]) => (
              <div className="stat" key={label}>
                <div className="stat-v">{value}</div>
                <div className="stat-l">{label}</div>
              </div>
            ))}
          </div>

          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? "tab on" : "tab"}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "payments" ? (
            <>
              {data.legacySessions > 0 ? (
                <p className="muted note">
                  {data.legacySessions} earlier payment
                  {data.legacySessions === 1 ? " was" : "s were"} credited before
                  details were logged. Those buyers still appear under Users with a
                  purchased count.
                </p>
              ) : null}
              {table(
                ["Email", "Pack", "Credits", "Amount", "When", "Stripe session"],
                data.payments.map((p) => [
                  p.email,
                  p.pack ?? "—",
                  p.credits,
                  money(p.amountCents, p.currency),
                  when(p.ts),
                  <span className="src" key="s">{p.sessionId}</span>,
                ]),
                "No payments logged yet.",
              )}
            </>
          ) : null}

          {tab === "checkouts"
            ? table(
                ["Email", "Pack", "Result", "When"],
                data.checkouts.map((c) => [
                  c.email,
                  c.pack,
                  c.ok ? (
                    "Sent to Stripe"
                  ) : (
                    <span className="err" key="e">{c.error ?? "Failed"}</span>
                  ),
                  when(c.ts),
                ]),
                "No one has clicked buy yet.",
              )
            : null}

          {tab === "users"
            ? table(
                ["Email", "Balance", "Purchased"],
                [...data.users]
                  .sort((a, b) => b.purchased - a.purchased)
                  .map((u) => [u.email, u.balance, u.purchased]),
                "No users yet.",
              )
            : null}

          {tab === "conversions"
            ? table(
                ["Owner", "When", "Size"],
                data.conversions.map((c) => [
                  c.owner === "__admin__" ? "admin" : c.owner,
                  when(c.createdAt),
                  `${(c.sizeBytes / 1e6).toFixed(1)} MB`,
                ]),
                "No conversions yet.",
              )
            : null}

          {tab === "waitlist"
            ? table(
                ["Email", "Added", "Source"],
                data.entries.map((e) => [e.email, when(e.ts), e.source ?? "—"]),
                "No signups yet.",
              )
            : null}
        </div>
      )}

      <style>{`
        .admin {
          min-height: 100vh;
          background: #17161a;
          color: #edeae0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          padding: 6vh 5vw;
          -webkit-font-smoothing: antialiased;
        }
        .admin h1 {
          font-family: var(--font-space-grotesk), sans-serif;
          font-weight: 700;
          letter-spacing: -0.02em;
          font-size: 28px;
          margin: 0;
        }
        .admin .muted { color: rgba(237,234,224,0.55); font-size: 13px; margin: 6px 0 0; }

        .gate {
          max-width: 340px;
          margin: 12vh auto 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .gate input {
          background: #201f24;
          border: 1.5px solid rgba(237,234,224,0.18);
          color: #edeae0;
          padding: 13px 14px;
          font-family: inherit;
          font-size: 15px;
          letter-spacing: 0.2em;
        }
        .gate input:focus { outline: 2px solid #e8412c; outline-offset: 2px; }
        .admin button {
          background: #e8412c;
          color: #fff;
          border: none;
          padding: 12px 16px;
          font-family: var(--font-space-grotesk), sans-serif;
          font-weight: 600;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          cursor: pointer;
        }
        .admin button:disabled { opacity: 0.5; cursor: default; }
        .admin button.ghost { background: transparent; color: rgba(237,234,224,0.7); border: 1.5px solid rgba(237,234,224,0.2); }
        .err { color: #ff6b57; font-size: 13px; }

        .dash-head {
          display: flex; justify-content: space-between; align-items: flex-end;
          gap: 16px; flex-wrap: wrap; margin-bottom: 26px;
          border-bottom: 1px solid rgba(237,234,224,0.14); padding-bottom: 18px;
        }
        .actions { display: flex; gap: 10px; flex-wrap: wrap; }

        .tablewrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th {
          text-align: left; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.08em; font-size: 11px; color: rgba(237,234,224,0.5);
          padding: 10px 14px; border-bottom: 1px solid rgba(237,234,224,0.14);
        }
        td { padding: 11px 14px; border-bottom: 1px solid rgba(237,234,224,0.07); }
        .num { color: rgba(237,234,224,0.4); width: 48px; font-variant-numeric: tabular-nums; }
        .email { font-family: var(--font-space-grotesk), sans-serif; }
        .when { color: rgba(237,234,224,0.55); white-space: nowrap; }
        .src { color: rgba(237,234,224,0.45); }
        tbody tr:hover { background: rgba(255,255,255,0.03); }
        .stats {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 10px; margin-bottom: 24px;
        }
        .stat { background: #201f24; padding: 14px 16px; }
        .stat-v { font-family: var(--font-space-grotesk), sans-serif; font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .stat-l { color: rgba(237,234,224,0.5); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
        .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
        .admin button.tab { background: transparent; color: rgba(237,234,224,0.6); border: 1.5px solid rgba(237,234,224,0.15); padding: 8px 12px; }
        .admin button.tab.on { background: #edeae0; color: #17161a; border-color: #edeae0; }
        .note { margin: 0 0 14px; }
        .empty { color: rgba(237,234,224,0.5); padding: 40px 0; }
      `}</style>
    </div>
  );
}
