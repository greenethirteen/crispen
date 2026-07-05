"use client";

import { useCallback, useRef, type CSSProperties } from "react";

/**
 * The Crispen wordmark: seven letters, seven bright hues, focusing in from a
 * blur on mount and again on hover. Colours persist at rest so the logo stays
 * bright and legible; the focus-pull is pure CSS (see .cl in globals.css).
 */
const LETTERS: ReadonlyArray<readonly [string, string]> = [
  ["C", "#FF3B30"], // red
  ["R", "#FF9500"], // orange
  ["I", "#FFC400"], // yellow
  ["S", "#22C55E"], // green
  ["P", "#00AEEF"], // cyan
  ["E", "#3B6BFF"], // blue
  ["N", "#C74BFF"], // violet
];

export default function CrispenLogo({
  className = "",
}: {
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  // Re-trigger the focus-pull by removing and re-adding the animation class,
  // forcing a reflow in between so the browser restarts the keyframes.
  const replay = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("cl-play");
    void el.offsetWidth;
    el.classList.add("cl-play");
  }, []);

  return (
    <span
      ref={ref}
      className={`cl cl-play ${className}`.trim()}
      onMouseEnter={replay}
      role="img"
      aria-label="Crispen"
    >
      {LETTERS.map(([ch, color], i) => (
        <span
          key={ch + i}
          className="cl-l"
          aria-hidden="true"
          style={{ color, animationDelay: `${i * 55}ms` } as CSSProperties}
        >
          {ch}
        </span>
      ))}
      <span className="cl-tm" aria-hidden="true">™</span>
    </span>
  );
}
