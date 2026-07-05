"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CrispenLogo from "../components/CrispenLogo";
import ProductionShowcase from "../components/ProductionShowcase";
import "./landing.css";

/**
 * Draws the demo mark (leaf blob + circle) centered in a w×h context, scaled
 * by `seed`. Pure — reused for both the low-res raster buffer and the crisp
 * vector half of the hero comparison.
 */
function drawShape(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: number,
) {
  c.save();
  c.translate(w / 2, h / 2);
  c.scale(seed, seed);
  c.fillStyle = "#F5A623";
  c.beginPath();
  c.moveTo(0, -40);
  c.bezierCurveTo(30, -40, 45, -10, 30, 20);
  c.bezierCurveTo(15, 45, -25, 45, -35, 15);
  c.bezierCurveTo(-45, -15, -20, -40, 0, -40);
  c.closePath();
  c.fill();
  c.fillStyle = "#00AEEF";
  c.beginPath();
  c.arc(-5, -2, 14, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#17161A";
  c.lineWidth = 2 / seed;
  c.stroke();
  c.restore();
}

/**
 * Inline email capture. POSTs to /api/waitlist, which persists the address
 * server-side and returns the live total. Rendered in both the hero and the
 * closing CTA; `source` records which one converted.
 */
function WaitlistForm({
  source,
  cta,
  onJoined,
}: {
  source: string;
  cta: string;
  onJoined: (count: number) => void;
}) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value || !value.includes("@")) {
      setMsg({ text: "Enter a valid email.", ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, source }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ text: data?.error ?? "Something went wrong.", ok: false });
        setBusy(false);
      } else {
        if (typeof data.count === "number") onJoined(data.count);
        // Navigate to the dedicated confirmation URL — this is the page Google
        // Ads (and any other tracker) keys the "lead form submitted" conversion
        // on. Keep `busy` true so the button stays disabled through the redirect.
        router.push("/thanks");
      }
    } catch {
      setMsg({ text: "Network error — try again in a moment.", ok: false });
      setBusy(false);
    }
  };

  return (
    <div className="waitlist-block">
      <form className="waitlist-form" onSubmit={submit}>
        <input
          type="email"
          placeholder="you@studio.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          required
          aria-label="Email address"
        />
        <button type="submit" disabled={busy}>
          {busy ? "…" : cta}
        </button>
      </form>
      <div
        className={`waitlist-msg${msg ? (msg.ok ? " ok" : " err") : ""}`}
        role="status"
        aria-live="polite"
      >
        {msg?.text ?? ""}
      </div>
    </div>
  );
}

export default function Landing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(400);

  const stepsRef = useRef<HTMLDivElement>(null);
  const [stepsInView, setStepsInView] = useState(false);

  // Global waitlist total, fetched from the server and updated on each join.
  const [count, setCount] = useState<number | null>(null);

  // ---------- Raster vs Vector zoom demo ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const half = w / 2;

    // LEFT: raster — rendered once into a fixed small buffer, then scaled up
    // with nearest-neighbor so it visibly pixelates as zoom climbs.
    const bufSize = 70;
    const off = document.createElement("canvas");
    off.width = bufSize;
    off.height = bufSize;
    const octx = off.getContext("2d");
    if (octx) drawShape(octx, bufSize, bufSize, bufSize / 110);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, half, h);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    const scale = (zoom / 100) * (h / bufSize) * 0.72;
    ctx.drawImage(
      off,
      half / 2 - (bufSize * scale) / 2,
      h / 2 - (bufSize * scale) / 2,
      bufSize * scale,
      bufSize * scale,
    );
    ctx.restore();

    // RIGHT: vector — redrawn crisp at full zoom, no fixed buffer.
    ctx.save();
    ctx.beginPath();
    ctx.rect(half, 0, w - half, h);
    ctx.clip();
    const vseed = (zoom / 100) * (h / 300) * 1.1;
    ctx.translate(half + half / 2 - w / 2, 0);
    drawShape(ctx, w, h, vseed);
    ctx.restore();

    // divider
    ctx.strokeStyle = "rgba(237,234,224,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(half, h);
    ctx.stroke();
  }, [zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // ---------- Steps flow animation (once, on scroll into view) ----------
  useEffect(() => {
    const el = stepsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setStepsInView(true);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ---------- Live waitlist count from the server ----------
  useEffect(() => {
    let alive = true;
    fetch("/api/waitlist")
      .then((r) => r.json())
      .then((d) => {
        if (alive && typeof d.count === "number") setCount(d.count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const countLine =
    count && count > 0
      ? `${count.toLocaleString()} ${count === 1 ? "person is" : "people are"} on the waitlist`
      : "";

  return (
    <div className="repro-landing">
      <nav>
        <CrispenLogo className="site-logo" />
        <div className="navlinks">
          <a href="#how">How it works</a>
          <a href="#package">Under the hood</a>
        </div>
        <a href="#waitlist" className="btn">
          Get early access →
        </a>
      </nav>

      <section className="hero">
        <div className="hero-text">
          <h1>
            Turn AI-gen images into{" "}
            <span className="accent">production-ready files</span>.
          </h1>
          <p className="sub">
            Vector paths, correct color, right resolution — the format a studio
            needs, not the one your AI tool gave you. We&apos;re building it now.
          </p>
          <p className="sub-line">Get in before launch.</p>
          <div id="waitlist-hero">
            <WaitlistForm
              source="hero"
              cta="Get early access"
              onJoined={setCount}
            />
          </div>
          {countLine ? (
            <div className="microcopy">{countLine}.</div>
          ) : null}
        </div>

        <div className="demo-stage">
          <div className="demo-card">
            <span className="crop tl" />
            <span className="crop tr" />
            <span className="crop bl" />
            <span className="crop br" />
            <div className="demo-label">
              <span>Drag to zoom</span>
              <span className="live">
                <span className="blip" />
                Live proof
              </span>
              <span>{zoom}%</span>
            </div>
            <div className="demo-canvas-wrap">
              <span className="demo-tag">Raster · what you have</span>
              <span className="demo-tag vector">
                Vector · what Crispen gives you
              </span>
              <canvas ref={canvasRef} />
            </div>
            <div className="demo-controls">
              <span
                className="mono"
                style={{ fontSize: 11, color: "rgba(237,234,224,0.5)" }}
              >
                100%
              </span>
              <input
                type="range"
                min={100}
                max={800}
                value={zoom}
                onChange={(e) => setZoom(parseInt(e.target.value, 10))}
                aria-label="Zoom level"
              />
              <span
                className="mono"
                style={{ fontSize: 11, color: "rgba(237,234,224,0.5)" }}
              >
                800%
              </span>
            </div>
            <div className="demo-caption">
              <span>Same file, both sides.</span>
              <span>Zoom past 300% and only one half survives.</span>
            </div>
          </div>
        </div>

      </section>

      <section id="how" className="dark">
        <div className="section-head">
          <span className="section-num mono">01</span>
          <h2 className="section-title">How it works</h2>
          <span className="section-kicker">Upload → press check → download</span>
        </div>
        <div
          ref={stepsRef}
          className={`flow${stepsInView ? " in-view" : ""}`}
        >
          <div
            className="flow-step"
            style={
              { "--accent": "#F5A623", transitionDelay: "0.05s" } as React.CSSProperties
            }
          >
            <div className="flow-visual">
              <span className="uv-drop">
                <span className="uv-arrow">↑</span>
              </span>
              <span className="uv-file mono">artwork.png</span>
            </div>
            <div className="flow-copy">
              <span className="flow-n mono">Step 01</span>
              <h3>Upload the AI image</h3>
              <p>Midjourney, DALL·E, whatever — drop it in as-is.</p>
            </div>
          </div>

          <span
            className="flow-arrow mono"
            aria-hidden="true"
            style={{ transitionDelay: "0.4s" }}
          >
            →
          </span>

          <div
            className="flow-step"
            style={
              { "--accent": "#00AEEF", transitionDelay: "0.2s" } as React.CSSProperties
            }
          >
            <div className="flow-visual cv">
              <span className="cv-row" style={{ transitionDelay: "0.55s" }}>
                <span className="cv-x">✕</span>
                <s>RGB</s>
                <span className="cv-to">→</span>
                <b>CMYK</b>
              </span>
              <span className="cv-row" style={{ transitionDelay: "0.7s" }}>
                <span className="cv-x">✕</span>
                <s>72 dpi</s>
                <span className="cv-to">→</span>
                <b>300 dpi</b>
              </span>
              <span className="cv-row" style={{ transitionDelay: "0.85s" }}>
                <span className="cv-x">✕</span>
                <s>Flat pixels</s>
                <span className="cv-to">→</span>
                <b>Vector paths</b>
              </span>
            </div>
            <div className="flow-copy">
              <span className="flow-n mono">Step 02</span>
              <h3>We run the press check</h3>
              <p>Every studio rejection reason, found and fixed.</p>
            </div>
          </div>

          <span
            className="flow-arrow mono"
            aria-hidden="true"
            style={{ transitionDelay: "0.55s" }}
          >
            →
          </span>

          <div
            className="flow-step"
            style={
              { "--accent": "#E8412C", transitionDelay: "0.35s" } as React.CSSProperties
            }
          >
            <div className="flow-visual dv">
              <span className="dv-chips">
                <span style={{ transitionDelay: "0.7s" }}>SVG</span>
                <span style={{ transitionDelay: "0.8s" }}>PDF/X</span>
                <span style={{ transitionDelay: "0.9s" }}>PSD</span>
              </span>
              <span className="dv-btn mono">↓ production-package.zip</span>
            </div>
            <div className="flow-copy">
              <span className="flow-n mono">Step 03</span>
              <h3>Download the package</h3>
              <p>Print-ready files, in every format the studio asks for.</p>
            </div>
          </div>
        </div>
      </section>

      <ProductionShowcase />

      <section id="problem">
        <div className="section-head">
          <span className="section-num mono">02</span>
          <h2 className="section-title">Why studios send it back</h2>
          <span className="section-kicker">
            The rejection reasons we hear most from studio ops
          </span>
        </div>
        <div className="rejects">
          <div className="reject-row">
            <span className="mark">✕</span>
            <div className="reject-copy">
              <div className="head">No editable paths</div>
            </div>
          </div>
          <div className="reject-row">
            <span className="mark">✕</span>
            <div className="reject-copy">
              <div className="head">RGB, not CMYK</div>
            </div>
          </div>
          <div className="reject-row">
            <span className="mark">✕</span>
            <div className="reject-copy">
              <div className="head">One flattened layer</div>
            </div>
          </div>
          <div className="reject-row">
            <span className="mark">✕</span>
            <div className="reject-copy">
              <div className="head">72dpi at OOH scale</div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section" id="waitlist">
        <div className="eyebrow" style={{ textAlign: "center" }}>
          Pre-release
        </div>
        <h2>Be first when it ships.</h2>
        <p className="sub">One email at launch. Nothing else.</p>
        <WaitlistForm source="cta" cta="Notify me" onJoined={setCount} />
        <div className="count">{countLine}</div>
      </section>

      <footer>
        <span>© 2026 Crispen</span>
        <span>Reg. marks are decorative. Files are not.</span>
      </footer>
    </div>
  );
}
