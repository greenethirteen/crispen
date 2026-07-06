"use client";

import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { firebaseAuth } from "../../lib/firebase-client";
import CrispenLogo from "../../components/CrispenLogo";
import "./lab.css";

type Phase =
  | "idle"
  | "separating"
  | "separated"
  | "packaging"
  | "done"
  | "error";

const STEP_LABELS: Record<string, string> = {
  separating: "Separating layers (AI)…",
  packaging: "Building production package…",
};

export default function LabPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [adminPw, setAdminPw] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [showBuy, setShowBuy] = useState(false);
  const [buying, setBuying] = useState("");
  const [paidNote, setPaidNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [numLayers, setNumLayers] = useState(4);
  const [widthInches, setWidthInches] = useState(12);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [layers, setLayers] = useState<string[]>([]);
  const [zipUrl, setZipUrl] = useState("");
  const dataUriRef = useRef<string>("");

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

  /** Fetch with the Firebase ID token (or admin password in the body). */
  async function authedFetch(url: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    if (user) {
      headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
    }
    return fetch(url, { ...init, headers });
  }

  async function refreshBalance() {
    if (!user) return;
    try {
      const res = await authedFetch("/api/billing/credits");
      const j = await res.json();
      if (res.ok) setBalance(j.balance);
    } catch {
      /* non-fatal */
    }
  }

  useEffect(() => {
    if (signedIn) refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  // Poll balance briefly after returning from checkout (webhook lag).
  useEffect(() => {
    if (!paidNote.startsWith("Payment") || !signedIn) return;
    const timer = setInterval(refreshBalance, 3000);
    const stop = setTimeout(() => clearInterval(timer), 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidNote, signedIn]);

  async function googleSignIn() {
    setError("");
    try {
      await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
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
    setZipUrl("");
    setPhase("idle");
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      dataUriRef.current = String(reader.result);
      setPreview(String(reader.result));
    };
    reader.readAsDataURL(f);
  }

  async function run() {
    if (!dataUriRef.current) return;
    setError("");
    setLayers([]);
    setZipUrl("");
    setPhase("separating");
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

      // 2) Poll until layers are ready.
      const authQS = adminMode
        ? `&password=${encodeURIComponent(adminPw)}`
        : "";
      let layerUrls: string[] = [];
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await authedFetch(
          `/api/lab/separate?id=${encodeURIComponent(submitJson.requestId)}${authQS}`,
        );
        const pollJson = await poll.json();
        if (!poll.ok) throw new Error(pollJson.error || "Poll failed");
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

      // 3) Build the production package (free — credit covered step 1).
      const pkg = await authedFetch("/api/lab/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...adminBody,
          original: dataUriRef.current,
          layerUrls,
          widthInches,
        }),
      });
      if (!pkg.ok) {
        const j = await pkg.json().catch(() => ({}));
        throw new Error(j.error || "Packaging failed");
      }
      const blob = await pkg.blob();
      setZipUrl(URL.createObjectURL(blob));
      setPhase("done");
    } catch (err) {
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

  const stage =
    phase === "separating" ? 0 : phase === "packaging" ? 1 : phase === "done" ? 3 : -1;

  return (
    <main className="lab">
      <header className="lab-top">
        <div className="lab-brand">
          <CrispenLogo className="lab-logo" />
          <span className="lab-tag mono">LAB</span>
        </div>
        <div className="lab-account">
          <a
            className="lab-home mono"
            href="/"
            target="_blank"
            rel="noopener"
          >
            Home ↗
          </a>
          <span className="lab-credits mono">
            {adminMode
              ? "admin"
              : balance === null
                ? "…"
                : `${balance} ${balance === 1 ? "credit" : "credits"}`}
            {!adminMode ? (
              <button
                className="lab-topup mono"
                onClick={() => setShowBuy((v) => !v)}
                title="Buy credits"
              >
                +
              </button>
            ) : null}
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
        <h1>Flat raster in. Layered, press-ready out.</h1>
        <p className="lab-dim">
          RGBA decomposition → 300 DPI resample → ICC-managed CMYK → layered
          PSD + print PDF
        </p>
      </div>

      <ol className="lab-stages" aria-hidden="true">
        {["AI layer separation", "300 DPI · CMYK", "PSD · PDF · ZIP"].map(
          (label, i) => (
            <li
              key={label}
              className={
                stage === 3 || stage > i
                  ? "done"
                  : stage === i || (stage === 1 && i === 2)
                    ? "active"
                    : ""
              }
            >
              <span className="lab-stage-dot mono">{i + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>

      {paidNote ? <div className="lab-note">{paidNote}</div> : null}

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
              ? STEP_LABELS[phase]
              : signedIn
                ? "Run pipeline (1 credit)"
                : "Run pipeline"}
          </button>
        </div>

        {error && unlocked ? <div className="lab-error">{error}</div> : null}
      </section>

      {signedIn && balance !== null && (broke || showBuy) ? (
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

      {layers.length > 0 ? (
        <section className="lab-panel">
          <h2>
            Separated layers{" "}
            <span className="lab-kicker mono">
              {layers.length} RGBA · editable
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

      {phase === "done" && zipUrl ? (
        <section className="lab-panel lab-done">
          <h2>Production package ready</h2>
          <div className="lab-manifest mono">
            <span>working-file.psd</span>
            <span>layers/ · 300 DPI RGBA</span>
            <span>print/artwork-cmyk.jpg</span>
            <span>print/artwork.pdf</span>
          </div>
          <a href={zipUrl} download="production-package.zip" className="lab-dl">
            ↓ Download production-package.zip
          </a>
        </section>
      ) : null}
    </main>
  );
}
