"use client";

import { useEffect, useRef, useState } from "react";

// The demo mark's outline as an editable cubic-Bézier path (same geometry as the
// hero's drawShape leaf), centered on the origin of a 120×120 viewBox.
const PATH =
  "M0,-40 C30,-40 45,-10 30,20 C15,45 -25,45 -35,15 C-45,-15 -20,-40 0,-40 Z";

// Anchor points and their control handles, pulled straight from the path above.
const ANCHORS = [
  { p: [0, -40], h: [[30, -40], [-20, -40]], color: "#F5A623" },
  { p: [30, 20], h: [[45, -10], [15, 45]], color: "#00AEEF" },
  { p: [-35, 15], h: [[-25, 45], [-45, -15]], color: "#E8412C" },
] as const;

/**
 * "Inside the production package" — a dark showcase section. Its centerpiece
 * draws the vector path on, then pops in live anchor nodes with Bézier handles;
 * the spec cards animate their own detail (CMYK plates, a DPI count-up, layer
 * separation, format chips). Everything triggers once on scroll into view and
 * collapses to a static end-state under prefers-reduced-motion.
 */
export default function ProductionShowcase() {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const [dpi, setDpi] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Count the DPI figure up to 300 once the section is visible.
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDpi(300);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 1500;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDpi(Math.round(eased * 300));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView]);

  return (
    <section
      ref={ref}
      id="package"
      className={`showcase dark${inView ? " go" : ""}`}
    >
      <div className="section-head">
        <span className="section-num mono">◆</span>
        <h2 className="section-title">Under the hood</h2>
        <span className="section-kicker">
          What actually ships the moment your art is deliverable
        </span>
      </div>

      <div className="showcase-grid">
        {/* ---------- Centerpiece: the vector path drawing itself ---------- */}
        <div className="vec-stage">
          <div className="vec-grid" aria-hidden="true" />
          <svg className="vec" viewBox="-60 -60 120 120" aria-hidden="true">
            <path className="vfill" d={PATH} />
            <path
              className="vpath"
              d={PATH}
              pathLength={1}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <g className="handles">
              {ANCHORS.flatMap((a, i) =>
                a.h.map((h, j) => (
                  <g key={`h${i}-${j}`}>
                    <line
                      className="handle"
                      x1={a.p[0]}
                      y1={a.p[1]}
                      x2={h[0]}
                      y2={h[1]}
                    />
                    <circle className="hdot" cx={h[0]} cy={h[1]} r={2.4} />
                  </g>
                )),
              )}
            </g>
            {ANCHORS.map((a, i) => (
              <rect
                key={`n${i}`}
                className="node"
                x={a.p[0] - 3.6}
                y={a.p[1] - 3.6}
                width={7.2}
                height={7.2}
                rx={1}
                style={{ fill: a.color, animationDelay: `${1.75 + i * 0.15}s` }}
              />
            ))}
          </svg>
          <div className="vec-caption mono">
            Editable Bézier paths · live anchor points
          </div>
        </div>

        {/* ---------- Spec cards ---------- */}
        <div className="specs">
          <article className="spec">
            <div className="spec-visual scale-viz">
              <span className="scale-inf">∞</span>
            </div>
            <h3>Vector, never pixels</h3>
            <p>
              Real editable paths — resize a logo mark from a business card to a
              four-metre billboard with zero loss of sharpness.
            </p>
          </article>

          <article className="spec">
            <div className="spec-visual cmyk-viz">
              <span className="plate c" />
              <span className="plate m" />
              <span className="plate y" />
              <span className="plate k" />
            </div>
            <h3>CMYK, colour-managed</h3>
            <p>
              Press-accurate colour with an embedded ICC profile. What you sign
              off on the proof is what comes off the press.
            </p>
          </article>

          <article className="spec">
            <div className="spec-visual dpi-viz">
              <span className="dpi-num">{dpi}</span>
              <span className="dpi-unit mono">DPI</span>
            </div>
            <h3>Print-grade resolution</h3>
            <p>
              300 DPI at final size, or resolution-independent vector — no
              pixelation the moment it goes up on a wall.
            </p>
          </article>

          <article className="spec">
            <div className="spec-visual layers-viz">
              <span className="layer l1" />
              <span className="layer l2" />
              <span className="layer l3" />
            </div>
            <h3>Separated layers</h3>
            <p>
              Type, artwork and background isolated on their own layers — pull
              any element for a new format without a recut.
            </p>
          </article>
        </div>
      </div>

      {/* ---------- Formats strip ---------- */}
      <div className="formats">
        <span className="formats-label mono">One package, every format:</span>
        <div className="chips">
          {["SVG", "PDF/X", "EPS", "AI", "PSD", "PNG"].map((f, i) => (
            <span
              key={f}
              className="chip"
              style={{ transitionDelay: `${0.3 + i * 0.08}s` }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
