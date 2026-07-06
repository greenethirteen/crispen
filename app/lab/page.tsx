"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  getAdditionalUserInfo,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}
import { firebaseAuth } from "../../lib/firebase-client";
import CrispenLogo from "../../components/CrispenLogo";
import "./lab.css";

type Phase = "idle" | "separating" | "packaging" | "done" | "error";

interface ReportRow {
  label: string;
  before: string;
  after: string;
  fixed: boolean;
}

interface PackageInfo {
  id: string;
  downloadUrl: string;
  sizeBytes: number;
  widthIn: number;
  heightIn: number;
  layerNames: string[];
  vectorCount: number;
  report: ReportRow[];
}

interface HistoryJob {
  id: string;
  createdAt: string;
  sizeBytes: number;
  widthIn: number;
  heightIn: number;
  layerNames: string[];
  vectorCount: number;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function LabPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [adminPw, setAdminPw] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [buying, setBuying] = useState("");
  const [paidNote, setPaidNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [numLayers, setNumLayers] = useState(4);
  const [widthInches, setWidthInches] = useState(12);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [pctLabel, setPctLabel] = useState("");
  const [error, setError] = useState("");
  const [layers, setLayers] = useState<string[]>([]);
  const [pkg, setPkg] = useState<PackageInfo | null>(null);
  const [history, setHistory] = useState<HistoryJob[]>([]);
  const [downloading, setDownloading] = useState("");
  const dataUriRef = useRef<string>("");
  const creepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const signedIn = user !== null;
  const unlocked = signedIn || adminMode;

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth(), (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Stripe redirect note.
  useEffect(() => {
    const paid = new URLSearchParams(window.location.search).get("paid");
    if (paid === "success") {
      setPaidNote("Payment received — your credits are being added.");
    } else if (paid === "cancel") {
      setPaidNote("Checkout cancelled.");
    }
    if (paid) window.history.replaceState(null, "", "/lab");
  }, []);

  /** Fetch with the Firebase ID token (or admin password in the query). */
  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (user) {
        headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
      }
      return fetch(url, { ...init, headers });
    },
    [user],
  );

  const adminQS = adminMode ? `password=${encodeURIComponent(adminPw)}` : "";

  const refreshBalance = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch("/api/billing/credits");
      const j = await res.json();
      if (res.ok) setBalance(j.balance);
    } catch {
      /* non-fatal */
    }
  }, [user, authedFetch]);

  const refreshHistory = useCallback(async () => {
    if (!unlocked) return;
    try {
      const url = adminMode ? `/api/lab/history?${adminQS}` : "/api/lab/history";
      const res = await authedFetch(url);
      const j = await res.json();
      if (res.ok) setHistory(j.jobs);
    } catch {
      /* non-fatal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, adminMode, user]);

  useEffect(() => {
    if (signedIn) refreshBalance();
    if (unlocked) refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, unlocked]);

  // Poll balance briefly after returning from checkout (webhook lag).
  useEffect(() => {
    if (!paidNote.startsWith("Payment") || !signedIn) return;
    const timer = setInterval(refreshBalance, 3000);
    const stop = setTimeout(() => clearInterval(timer), 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [paidNote, signedIn, refreshBalance]);

  /* ---- progress helpers: jump to a floor, then creep toward a cap ---- */
  function creep(cap: number, msPerStep: number) {
    if (creepRef.current) clearInterval(creepRef.current);
    creepRef.current = setInterval(() => {
      setPct((p) => (p < cap ? p + 1 : p));
    }, msPerStep);
  }
  function progress(floor: number, cap: number, label: string, msPerStep = 400) {
    setPct((p) => Math.max(p, floor));
    setPctLabel(label);
    creep(cap, msPerStep);
  }
  function stopProgress() {
    if (creepRef.current) clearInterval(creepRef.current);
    creepRef.current = null;
  }
  useEffect(() => stopProgress, []);

  // Scroll to results once the package is ready.
  useEffect(() => {
    if (phase === "done" && pkg) {
      const t = setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        120,
      );
      return () => clearTimeout(t);
    }
  }, [phase, pkg]);

  async function googleSignIn() {
    setError("");
    try {
      const cred = await signInWithPopup(
        firebaseAuth(),
        new GoogleAuthProvider(),
      );
      // Google Ads "Sign-up" conversion — fires once, on first-ever sign-up.
      if (getAdditionalUserInfo(cred)?.isNewUser) {
        window.gtag?.("event", "conversion", {
          send_to: "AW-18301050102/s33fCKyQgMwcEPa5z5ZE",
          value: 1.0,
          currency: "AED",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    }
  }

  async function buy(pack: "starter" | "studio") {
    setBuying(pack);
    try {
      const res = await authedFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Checkout failed");
      window.location.href = j.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBuying("");
    }
  }

  function onFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setLayers([]);
    setPkg(null);
    setPhase("idle");
    setPct(0);
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      dataUriRef.current = String(reader.result);
      setPreview(String(reader.result));
    };
    reader.readAsDataURL(f);
  }

  async function download(id: string, url: string) {
    setDownloading(id);
    try {
      const full = adminMode ? `${url}${url.includes("?") ? "&" : "?"}${adminQS}` : url;
      const res = await authedFetch(full);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "production-package.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading("");
    }
  }

  async function run() {
    if (!dataUriRef.current) return;
    setError("");
    setLayers([]);
    setPkg(null);
    setPhase("separating");
    setPct(0);
    progress(3, 8, "Uploading…", 250);
    const adminBody = adminMode ? { password: adminPw } : {};
    try {
      // 1) Submit to the separation queue (spends 1 credit unless admin).
      const submit = await authedFetch("/api/lab/separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...adminBody,
          image: dataUriRef.current,
          numLayers,
        }),
      });
      const submitJson = await submit.json();
      if (submit.status === 402) {
        setBalance(0);
        throw new Error("You're out of credits — grab a pack below.");
      }
      if (!submit.ok) throw new Error(submitJson.error || "Submit failed");
      if (typeof submitJson.balance === "number") setBalance(submitJson.balance);
      progress(10, 30, "In the AI queue…", 1600);

      // 2) Poll until layers are ready.
      const pollQS = adminMode ? `&${adminQS}` : "";
      let layerUrls: string[] = [];
      let sawProgress = false;
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await authedFetch(
          `/api/lab/separate?id=${encodeURIComponent(submitJson.requestId)}${pollQS}`,
        );
        const pollJson = await poll.json();
        if (!poll.ok) throw new Error(pollJson.error || "Poll failed");
        if (pollJson.status === "IN_PROGRESS" && !sawProgress) {
          sawProgress = true;
          progress(35, 66, "Separating layers (AI)…", 900);
        }
        if (pollJson.status === "COMPLETED") {
          layerUrls = pollJson.layers.map((l: { url: string }) => l.url);
          break;
        }
        if (pollJson.status === "FAILED") {
          if (signedIn) refreshBalance(); // credit was auto-refunded
          throw new Error(
            (pollJson.error || "Separation failed") +
              (signedIn ? " Your credit was refunded." : ""),
          );
        }
      }
      if (layerUrls.length === 0) throw new Error("Timed out waiting for layers");
      setLayers(layerUrls);
      setPhase("packaging");
      progress(70, 96, "300 DPI · CMYK · PSD · PDF · vectors…", 1100);

      // 3) Build + persist the production package (free — credit spent above).
      const res = await authedFetch("/api/lab/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...adminBody,
          original: dataUriRef.current,
          layerUrls,
          widthInches,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Packaging failed");
      stopProgress();
      setPct(100);
      setPctLabel("Done");
      setPkg(j);
      setPhase("done");
      refreshHistory();
    } catch (err) {
      stopProgress();
      setError(err instanceof Error ? err.message : "Unknown error");
      setPhase("error");
    }
  }

  if (!authReady && !adminMode) {
    return (
      <main className="lab lab-centered">
        <div className="lab-gate">
          <div className="lab-brand">
            <CrispenLogo className="lab-logo" />
            <span className="lab-tag mono">LAB</span>
          </div>
          <p className="lab-dim">Loading…</p>
        </div>
      </main>
    );
  }

  if (!unlocked) {
    return (
      <main className="lab lab-centered">
        <div className="lab-gate">
          <div className="lab-brand">
            <CrispenLogo className="lab-logo" />
            <span className="lab-tag mono">LAB</span>
          </div>
          <h1>Turn an AI image into a production-ready package.</h1>
          <p className="lab-dim">
            Separated layers · layered PSD · CMYK · print PDF · 300 DPI
          </p>
          <p className="lab-free mono">Your first 3 conversions are free.</p>
          <button className="lab-google" onClick={googleSignIn}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.6 2.8c2.2-2 3.8-5 3.8-8.5z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.6-2.9c-1 .7-2.4 1.2-4.3 1.2-3.3 0-6.1-2.2-7.1-5.2L1.2 17C3.1 21.1 7.2 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M4.9 14.2a7.6 7.6 0 0 1 0-4.5L1.2 6.9a12 12 0 0 0 0 10.2l3.7-2.9z"
              />
              <path
                fill="#EA4335"
                d="M12 4.7c1.9 0 3.1.8 3.8 1.5l2.8-2.8C16.9 1.7 14.5.7 12 .7 7.2.7 3.1 3.5 1.2 7.6l3.7 2.9c1-3 3.8-5.8 7.1-5.8z"
              />
            </svg>
            Continue with Google
          </button>
          {error ? <div className="lab-error">{error}</div> : null}
          {showAdmin ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (adminPw) setAdminMode(true);
              }}
            >
              <input
                type="password"
                placeholder="Admin password"
                value={adminPw}
                onChange={(e) => setAdminPw(e.target.value)}
                autoFocus
              />
              <button type="submit">Enter</button>
            </form>
          ) : (
            <button className="lab-admin-link" onClick={() => setShowAdmin(true)}>
              admin
            </button>
          )}
        </div>
      </main>
    );
  }

  const busy = phase === "separating" || phase === "packaging";
  const broke = signedIn && balance !== null && balance < 1;

  return (
    <main className="lab">
      <header className="lab-top">
        <div className="lab-brand">
          <CrispenLogo className="lab-logo" />
          <span className="lab-tag mono">LAB</span>
        </div>
        <div className="lab-account">
          <a className="lab-home mono" href="/" target="_blank" rel="noopener">
            Home ↗
          </a>
          <span className="lab-credits mono">
            {adminMode
              ? "admin"
              : balance === null
                ? "…"
                : `${balance} ${balance === 1 ? "credit" : "credits"}`}
          </span>
          <button
            className="lab-signout"
            onClick={() =>
              adminMode ? setAdminMode(false) : signOut(firebaseAuth())
            }
          >
            {adminMode ? "admin" : user?.email} ✕
          </button>
        </div>
      </header>

      <div className="lab-hero">
        <h1>AI image in. Press-ready out.</h1>
        <p className="lab-dim">
          RGBA decomposition → 300 DPI resample → ICC-managed CMYK → layered
          PSD + print PDF
        </p>
      </div>

      {paidNote ? <div className="lab-note">{paidNote}</div> : null}

      {/* ---------- upload + options ---------- */}
      <section className="lab-panel">
        <label className="lab-drop">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Input preview" />
          ) : (
            <span>Click to choose an AI-generated image</span>
          )}
        </label>

        <div className="lab-options">
          <label>
            Layers
            <select
              value={numLayers}
              onChange={(e) => setNumLayers(Number(e.target.value))}
              disabled={busy}
            >
              {[2, 3, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Print width (inches)
            <input
              type="number"
              min={1}
              max={60}
              value={widthInches}
              onChange={(e) => setWidthInches(Number(e.target.value))}
              disabled={busy}
            />
          </label>
          <button
            className="lab-run"
            onClick={run}
            disabled={!file || busy || broke}
          >
            {busy
              ? "Working…"
              : signedIn
                ? "Run pipeline (1 credit)"
                : "Run pipeline"}
          </button>
        </div>

        {busy || phase === "done" ? (
          <div className="lab-progress" role="progressbar" aria-valuenow={pct}>
            <div className="lab-progress-top mono">
              <span>{pctLabel}</span>
              <span>{pct}%</span>
            </div>
            <div className="lab-progress-track">
              <div className="lab-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : null}

        {error ? <div className="lab-error">{error}</div> : null}
      </section>

      {/* ---------- results ---------- */}
      <div ref={resultsRef}>
        {pkg ? (
          <section className="lab-panel lab-done">
            <h2>
              Press check
              <span className="lab-kicker mono">
                {pkg.widthIn.toFixed(1)}″ × {pkg.heightIn.toFixed(1)}″ · 300 DPI
              </span>
            </h2>
            <div className="lab-report">
              {pkg.report.map((r) => (
                <div className="lab-report-row" key={r.label}>
                  <span className="lab-report-label mono">{r.label}</span>
                  <span className="lab-report-before">
                    <b>✕</b> {r.before}
                  </span>
                  <span className="lab-report-arrow mono">→</span>
                  <span className={`lab-report-after${r.fixed ? " ok" : ""}`}>
                    <b>{r.fixed ? "✓" : "·"}</b> {r.after}
                  </span>
                </div>
              ))}
            </div>
            <button
              className="lab-dl"
              onClick={() => download(pkg.id, pkg.downloadUrl)}
              disabled={downloading !== ""}
            >
              {downloading === pkg.id
                ? "Preparing…"
                : `↓ Download production-package.zip (${mb(pkg.sizeBytes)})`}
            </button>
            <p className="lab-dim lab-keep">
              Saved to your account — re-download any time from History below.
            </p>
          </section>
        ) : null}

        {layers.length > 0 ? (
          <section className="lab-panel">
            <h2>
              Separated layers{" "}
              <span className="lab-kicker mono">
                {layers.length} RGBA · editable
                {pkg ? ` · ${pkg.layerNames.join(" / ")}` : ""}
              </span>
            </h2>
            <div className="lab-layers">
              {layers.map((url, i) => (
                <figure key={url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Layer ${i + 1}`} />
                  <figcaption className="mono">L{i + 1}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* ---------- credits ---------- */}
      {signedIn && balance !== null ? (
        <section className={`lab-panel lab-buy${broke ? " urgent" : ""}`}>
          <h2>{broke ? "Out of credits" : "Top up"}</h2>
          <div className="lab-packs">
            <button
              className="lab-pack"
              onClick={() => buy("starter")}
              disabled={buying !== ""}
            >
              <strong>Starter</strong>
              <span>10 conversions</span>
              <span className="lab-price">
                {buying === "starter" ? "Redirecting…" : "$19"}
              </span>
            </button>
            <button
              className="lab-pack"
              onClick={() => buy("studio")}
              disabled={buying !== ""}
            >
              <strong>Studio</strong>
              <span>50 conversions</span>
              <span className="lab-price">
                {buying === "studio" ? "Redirecting…" : "$69"}
              </span>
            </button>
          </div>
          <p className="lab-dim">
            Secure checkout via Stripe. Failed conversions are refunded
            automatically. Credits never expire.
          </p>
        </section>
      ) : null}

      {/* ---------- history ---------- */}
      {history.length > 0 ? (
        <section className="lab-panel">
          <h2>
            History
            <span className="lab-kicker mono">
              packages are kept — refresh-proof
            </span>
          </h2>
          <div className="lab-history">
            {history.map((j) => (
              <div className="lab-history-row" key={j.id}>
                <span className="mono lab-history-date">
                  {new Date(j.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="lab-history-meta">
                  {j.widthIn.toFixed(1)}″×{j.heightIn.toFixed(1)}″ ·{" "}
                  {j.layerNames.length} layers
                  {j.vectorCount > 0 ? ` · ${j.vectorCount} SVG` : ""} ·{" "}
                  {mb(j.sizeBytes)}
                </span>
                <button
                  className="lab-history-dl mono"
                  onClick={() => download(j.id, `/api/lab/download?id=${j.id}`)}
                  disabled={downloading !== ""}
                >
                  {downloading === j.id ? "…" : "↓ zip"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
