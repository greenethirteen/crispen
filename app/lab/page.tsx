"use client";

import { useEffect, useRef, useState } from "react";
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

const ADMIN_RE = /^\d{4,}$/; // no "@" → treated as admin password attempt

export default function LabPage() {
  const [identity, setIdentity] = useState(""); // email, or admin password
  const [unlocked, setUnlocked] = useState(false);
  const [gateError, setGateError] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
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

  const isEmail = identity.includes("@");
  const auth = isEmail ? { email: identity } : { password: identity };

  // Restore identity after a Stripe redirect; show payment note.
  useEffect(() => {
    const saved = window.localStorage.getItem("crispen-lab-id");
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("paid");
    if (saved) {
      setIdentity(saved);
      setUnlocked(true);
    }
    if (paid === "success") {
      setPaidNote("Payment received — your credits are being added.");
    } else if (paid === "cancel") {
      setPaidNote("Checkout cancelled.");
    }
    if (paid) {
      window.history.replaceState(null, "", "/lab");
    }
  }, []);

  async function refreshBalance(id: string) {
    if (!id.includes("@")) {
      setBalance(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/billing/credits?email=${encodeURIComponent(id)}`,
      );
      const j = await res.json();
      if (res.ok) setBalance(j.balance);
    } catch {
      /* non-fatal */
    }
  }

  useEffect(() => {
    if (unlocked && identity) refreshBalance(identity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, identity]);

  // Poll balance briefly after returning from checkout (webhook lag).
  useEffect(() => {
    if (!paidNote.startsWith("Payment") || !identity.includes("@")) return;
    const timer = setInterval(() => refreshBalance(identity), 3000);
    const stop = setTimeout(() => clearInterval(timer), 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidNote, identity]);

  function enter(e: React.FormEvent) {
    e.preventDefault();
    const id = identity.trim().toLowerCase();
    if (!id) return;
    if (!id.includes("@") && !ADMIN_RE.test(id)) {
      setGateError("Enter your email address.");
      return;
    }
    setIdentity(id);
    setUnlocked(true);
    setGateError("");
    window.localStorage.setItem("crispen-lab-id", id);
  }

  function signOut() {
    window.localStorage.removeItem("crispen-lab-id");
    setUnlocked(false);
    setIdentity("");
    setBalance(null);
  }

  async function buy(pack: "starter" | "studio") {
    if (!isEmail) return;
    setBuying(pack);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identity, pack }),
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
    try {
      // 1) Submit to the separation queue (spends 1 credit unless admin).
      const submit = await fetch("/api/lab/separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...auth,
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
      const authQS = isEmail
        ? `email=${encodeURIComponent(identity)}`
        : `password=${encodeURIComponent(identity)}`;
      let layerUrls: string[] = [];
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await fetch(
          `/api/lab/separate?id=${encodeURIComponent(submitJson.requestId)}&${authQS}`,
        );
        const pollJson = await poll.json();
        if (!poll.ok) throw new Error(pollJson.error || "Poll failed");
        if (pollJson.status === "COMPLETED") {
          layerUrls = pollJson.layers.map((l: { url: string }) => l.url);
          break;
        }
        if (pollJson.status === "FAILED") {
          if (isEmail) refreshBalance(identity); // credit was auto-refunded
          throw new Error(
            (pollJson.error || "Separation failed") +
              (isEmail ? " Your credit was refunded." : ""),
          );
        }
      }
      if (layerUrls.length === 0) throw new Error("Timed out waiting for layers");
      setLayers(layerUrls);
      setPhase("packaging");

      // 3) Build the production package (free — credit covered step 1).
      const pkg = await fetch("/api/lab/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...auth,
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

  if (!unlocked) {
    return (
      <main className="lab">
        <div className="lab-gate">
          <h1>Crispen Lab</h1>
          <p className="lab-dim">
            Enter your email — your first 3 conversions are free.
          </p>
          <form onSubmit={enter}>
            <input
              type="text"
              placeholder="you@studio.com"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              autoFocus
            />
            <button type="submit">Enter</button>
          </form>
          {gateError ? <div className="lab-error">{gateError}</div> : null}
        </div>
      </main>
    );
  }

  const busy = phase === "separating" || phase === "packaging";
  const broke = isEmail && balance !== null && balance < 1;

  return (
    <main className="lab">
      <header className="lab-head">
        <div>
          <h1>Crispen Lab</h1>
          <p className="lab-dim">
            Image → AI layer separation → 300 DPI → CMYK → PSD + PDF → zip
          </p>
        </div>
        <div className="lab-account">
          {isEmail ? (
            <span className="lab-credits mono">
              {balance === null ? "…" : balance}{" "}
              {balance === 1 ? "credit" : "credits"}
            </span>
          ) : (
            <span className="lab-credits mono">admin</span>
          )}
          <button className="lab-signout" onClick={signOut}>
            {identity} ✕
          </button>
        </div>
      </header>

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
              : isEmail
                ? "Run pipeline (1 credit)"
                : "Run pipeline"}
          </button>
        </div>

        {error ? <div className="lab-error">{error}</div> : null}
      </section>

      {isEmail && (broke || balance !== null) ? (
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
          <h2>Separated layers</h2>
          <div className="lab-layers">
            {layers.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={`Layer ${i + 1}`} />
            ))}
          </div>
        </section>
      ) : null}

      {phase === "done" && zipUrl ? (
        <section className="lab-panel lab-done">
          <h2>Production package ready</h2>
          <p className="lab-dim">
            Layered PSD · 300 DPI RGBA layers · CMYK artwork · print PDF
          </p>
          <a href={zipUrl} download="production-package.zip" className="lab-dl">
            ↓ production-package.zip
          </a>
        </section>
      ) : null}
    </main>
  );
}
