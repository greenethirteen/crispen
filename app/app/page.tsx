"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { CropFrame } from "@/components/CropFrame";
import { RejectReport, PrintSizeControl } from "@/components/RejectReport";
import { VectorPanel } from "@/components/VectorPanel";
import CrispenLogo from "@/components/CrispenLogo";
import { buildReport, formatBytes, type PrintSize } from "@/lib/checks";
import type { AnalyzeResponse } from "@/lib/types";

type Phase = "upload" | "analyzing" | "report";
type TraceState = "idle" | "tracing" | "done" | "error";

export default function ToolPage() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [printSize, setPrintSize] = useState<PrintSize>({
    width: 0,
    height: 0,
    unit: "in",
  });

  const [traceState, setTraceState] = useState<TraceState>("idle");
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);

  const objectUrlRef = useRef<string>("");

  // Revoke object URLs on unmount / replacement to avoid leaks.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const printSizeForReport = useMemo<PrintSize | null>(() => {
    return printSize.width > 0 && printSize.height > 0 ? printSize : null;
  }, [printSize]);

  const report = useMemo(() => {
    if (!analysis) return [];
    return buildReport(analysis.meta, printSizeForReport);
  }, [analysis, printSizeForReport]);

  const handleFile = useCallback(async (incoming: File) => {
    setUploadError(null);
    setPhase("analyzing");

    // Reset any prior state / traced output.
    setAnalysis(null);
    setTraceState("idle");
    setSvgMarkup(null);
    setTraceError(null);

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(incoming);
    objectUrlRef.current = url;
    setPreviewUrl(url);
    setFile(incoming);

    try {
      const form = new FormData();
      form.append("file", incoming);
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Analysis failed.");
      }
      const data: AnalyzeResponse = await res.json();
      setAnalysis(data);
      setPhase("report");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Analysis failed.");
      setPhase("upload");
    }
  }, []);

  const handleTrace = useCallback(async () => {
    if (!file) return;
    setTraceState("tracing");
    setTraceError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/vectorize", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Trace failed.");
      }
      const svg = await res.text();
      setSvgMarkup(svg);
      setTraceState("done");
    } catch (err) {
      setTraceError(err instanceof Error ? err.message : "Trace failed.");
      setTraceState("error");
    }
  }, [file]);

  const handleDownload = useCallback(() => {
    if (!svgMarkup) return;
    const blob = new Blob([svgMarkup], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = (file?.name ?? "artwork").replace(/\.[^.]+$/, "");
    a.download = `${base}-crispen.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [svgMarkup, file]);

  const handleReset = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    }
    setPhase("upload");
    setFile(null);
    setPreviewUrl("");
    setAnalysis(null);
    setUploadError(null);
    setTraceState("idle");
    setSvgMarkup(null);
    setTraceError(null);
    setPrintSize({ width: 0, height: 0, unit: "in" });
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      {/* Masthead */}
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-ink/15 pb-4">
        <div>
          <Link
            href="/"
            className="inline-flex items-center"
            aria-label="Back to Crispen home"
          >
            <CrispenLogo className="text-4xl sm:text-5xl" />
          </Link>
          <p className="label-mono mt-3">
            Press-check &amp; vector prep for AI-generated art
          </p>
        </div>
        <div className="text-right">
          <Link
            href="/"
            className="label-mono underline underline-offset-2 hover:text-registration"
          >
            ← Home
          </Link>
          <p className="mt-1 font-mono text-sm text-ink/60">
            {new Date().toISOString().slice(0, 10)} · Proof Sheet · v1
          </p>
        </div>
      </header>

      {phase === "upload" && (
        <section className="mx-auto max-w-2xl">
          <CropFrame className="p-6">
            <div className="p-2">
              <UploadZone onFile={handleFile} />
            </div>
          </CropFrame>
          {uploadError && (
            <p className="mt-4 text-center font-mono text-sm text-registration">
              ✕ {uploadError}
            </p>
          )}
          <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              "01 · Resolution & DPI check",
              "02 · Color mode & alpha",
              "03 · Raster → SVG trace",
            ].map((t) => (
              <p
                key={t}
                className="label-mono border border-ink/15 bg-white/30 px-3 py-2"
              >
                {t}
              </p>
            ))}
          </div>
        </section>
      )}

      {phase === "analyzing" && (
        <div className="py-24 text-center">
          <p className="label-mono animate-pulse">Running press check…</p>
        </div>
      )}

      {phase === "report" && analysis && (
        <div className="space-y-10">
          {/* Job slug line */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-ink px-4 py-2.5 font-mono text-xs text-paper">
            <span className="truncate">FILE: {analysis.meta.fileName}</span>
            <span className="text-paper/70">
              {analysis.meta.format.toUpperCase()} · {analysis.meta.width}×
              {analysis.meta.height}px ·{" "}
              {formatBytes(analysis.meta.fileSizeBytes)} ·{" "}
              {analysis.meta.colorSpace.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="underline underline-offset-2 hover:text-registration"
            >
              New file
            </button>
          </div>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            {/* Left: reject report */}
            <div className="space-y-4">
              <PrintSizeControl value={printSize} onChange={setPrintSize} />
              <RejectReport rows={report} />
            </div>

            {/* Right: vector conversion */}
            <VectorPanel
              previewUrl={previewUrl}
              fileName={analysis.meta.fileName}
              vectorizable={analysis.vectorizable}
              vectorizableReason={analysis.vectorizableReason}
              traceState={traceState}
              svgMarkup={svgMarkup}
              errorMessage={traceError}
              onTrace={handleTrace}
              onDownload={handleDownload}
            />
          </div>
        </div>
      )}

      <footer className="mt-16 border-t border-ink/20 pt-4">
        <p className="label-mono text-ink/40">
          Crispen v1 — stateless MVP · CMYK &amp; DPI figures are approximate, for
          prepress guidance only.
        </p>
      </footer>
    </main>
  );
}
