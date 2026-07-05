"use client";

import { useRef, useState } from "react";
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
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [numLayers, setNumLayers] = useState(4);
  const [widthInches, setWidthInches] = useState(12);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [layers, setLayers] = useState<string[]>([]);
  const [zipUrl, setZipUrl] = useState("");
  const dataUriRef = useRef<string>("");

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
      // 1) Submit to the separation queue.
      const submit = await fetch("/api/lab/separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          image: dataUriRef.current,
          numLayers,
        }),
      });
      const submitJson = await submit.json();
      if (!submit.ok) throw new Error(submitJson.error || "Submit failed");

      // 2) Poll until layers are ready.
      let layerUrls: string[] = [];
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await fetch(
          `/api/lab/separate?id=${encodeURIComponent(submitJson.requestId)}&password=${encodeURIComponent(password)}`,
        );
        const pollJson = await poll.json();
        if (!poll.ok) throw new Error(pollJson.error || "Poll failed");
        if (pollJson.status === "COMPLETED") {
          layerUrls = pollJson.layers.map((l: { url: string }) => l.url);
          break;
        }
        if (pollJson.status === "FAILED") {
          throw new Error(pollJson.error || "Separation failed");
        }
      }
      if (layerUrls.length === 0) throw new Error("Timed out waiting for layers");
      setLayers(layerUrls);
      setPhase("packaging");

      // 3) Build the production package.
      const pkg = await fetch("/api/lab/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
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
          <p className="lab-dim">Internal pre-release build.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (password) setUnlocked(true);
            }}
          >
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button type="submit">Enter</button>
          </form>
        </div>
      </main>
    );
  }

  const busy = phase === "separating" || phase === "packaging";

  return (
    <main className="lab">
      <header className="lab-head">
        <h1>Crispen Lab</h1>
        <p className="lab-dim">
          Image → AI layer separation → 300 DPI → CMYK → PSD + PDF → zip
        </p>
      </header>

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
          <button className="lab-run" onClick={run} disabled={!file || busy}>
            {busy ? STEP_LABELS[phase] : "Run pipeline"}
          </button>
        </div>

        {error ? <div className="lab-error">{error}</div> : null}
      </section>

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
