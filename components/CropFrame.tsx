import type { ReactNode } from "react";

/**
 * Wraps content in a bordered panel with registration/crop marks at each
 * corner — the press-check spec-sheet motif used throughout the app.
 */
export function CropFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="crop-mark crop-tl" aria-hidden />
      <span className="crop-mark crop-tr" aria-hidden />
      <span className="crop-mark crop-bl" aria-hidden />
      <span className="crop-mark crop-br" aria-hidden />
      <div className="border border-ink/25 bg-white/40">{children}</div>
    </div>
  );
}
