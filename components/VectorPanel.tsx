"use client";

type TraceState = "idle" | "tracing" | "done" | "error";

export function VectorPanel({
  previewUrl,
  fileName,
  vectorizable,
  vectorizableReason,
  traceState,
  svgMarkup,
  errorMessage,
  onTrace,
  onDownload,
}: {
  previewUrl: string;
  fileName: string;
  vectorizable: boolean;
  vectorizableReason: string;
  traceState: TraceState;
  svgMarkup: string | null;
  errorMessage: string | null;
  onTrace: () => void;
  onDownload: () => void;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between border-b border-ink pb-2">
        <h2 className="font-display text-xl font-bold">Vector Conversion</h2>
        <span className="label-mono">Raster → SVG · potrace</span>
      </div>

      <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
        {/* Original */}
        <figure className="space-y-2">
          <figcaption className="label-mono">Original raster</figcaption>
          <div className="checkerboard flex aspect-square items-center justify-center overflow-hidden border border-ink/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Original upload"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </figure>

        {/* Traced */}
        <figure className="space-y-2">
          <figcaption className="label-mono">Traced vector (SVG)</figcaption>
          <div className="checkerboard flex aspect-square items-center justify-center overflow-hidden border border-ink/20">
            {traceState === "done" && svgMarkup ? (
              <div
                className="flex h-full w-full items-center justify-center p-2 [&>svg]:max-h-full [&>svg]:max-w-full"
                // Trusted: SVG is generated server-side by potrace from the upload.
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : traceState === "tracing" ? (
              <span className="label-mono animate-pulse">Tracing…</span>
            ) : traceState === "error" ? (
              <span className="px-4 text-center font-mono text-sm text-registration">
                ✕ {errorMessage ?? "Trace failed."}
              </span>
            ) : (
              <span className="label-mono text-ink/40">Awaiting trace</span>
            )}
          </div>
        </figure>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onTrace}
          disabled={traceState === "tracing"}
          className="border border-ink bg-ink px-5 py-2.5 font-mono text-sm uppercase tracking-wide text-paper transition-colors hover:bg-registration hover:border-registration disabled:opacity-50"
        >
          {traceState === "done"
            ? "Re-trace"
            : traceState === "tracing"
              ? "Tracing…"
              : "Trace to SVG"}
        </button>

        {traceState === "done" && (
          <button
            type="button"
            onClick={onDownload}
            className="border border-proof px-5 py-2.5 font-mono text-sm uppercase tracking-wide text-proof transition-colors hover:bg-proof hover:text-ink"
          >
            ↓ Download SVG
          </button>
        )}

        <p
          className={`ml-auto max-w-md font-mono text-[13px] leading-relaxed ${
            vectorizable ? "text-ink/55" : "text-registration"
          }`}
        >
          {vectorizable ? "✓ " : "✕ "}
          {vectorizableReason}
        </p>
      </div>

      <p className="mt-3 border-t border-dashed border-ink/20 pt-3 label-mono text-ink/45">
        Note: trace is a single-ink posterized approximation, not a color
        separation. SVG output only in v1.
      </p>
    </section>
  );
}
