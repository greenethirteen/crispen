"use client";

import { useState } from "react";

type Entry = { email: string; ts: number; source?: string };

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
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
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Wrong password.");
        setEntries(null);
      } else {
        setEntries(data.entries as Entry[]);
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    if (!entries?.length) return;
    try {
      await navigator.clipboard.writeText(entries.map((e) => e.email).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const signOut = () => {
    setEntries(null);
    setPassword("");
  };

  return (
    <div className="admin">
      {entries === null ? (
        <form className="gate" onSubmit={submit}>
          <h1>Crispen admin</h1>
          <p className="muted">Enter the password to view the waitlist.</p>
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
            {busy ? "Checking…" : "View emails"}
          </button>
          {error ? <div className="err">{error}</div> : null}
        </form>
      ) : (
        <div className="dash">
          <div className="dash-head">
            <div>
              <h1>Waitlist</h1>
              <p className="muted">
                {entries.length}{" "}
                {entries.length === 1 ? "signup" : "signups"} collected
              </p>
            </div>
            <div className="actions">
              <button onClick={copyAll} disabled={!entries.length}>
                {copied ? "Copied ✓" : "Copy all emails"}
              </button>
              <button className="ghost" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="empty">No signups yet.</div>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Email</th>
                    <th>Added</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.email + i}>
                      <td className="num">{entries.length - i}</td>
                      <td className="email">{e.email}</td>
                      <td className="when">
                        {e.ts ? new Date(e.ts).toLocaleString() : "—"}
                      </td>
                      <td className="src">{e.source ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
        .empty { color: rgba(237,234,224,0.5); padding: 40px 0; }
      `}</style>
    </div>
  );
}
