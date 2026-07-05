"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CrispenLogo from "../components/CrispenLogo";
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
          <a href="#problem">The problem</a>
          <a href="#how">How it works</a>
          <a href="#studios">For studios</a>
        </div>
        <a href="#waitlist" className="btn">
          Get early access →
        </a>
      </nav>

      <section className="hero">
        <div className="hero-text">
          <h1>
            Turn AI-generated images into
            <br />
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
          <div className="microcopy">
            For freelancers, in-house creative teams, and studios — anyone
            handing an AI concept to production.{" "}
            <a href="#problem" style={{ color: "var(--red)" }}>
              See what gets rejected ↓
            </a>
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
          <h2 className="section-title">
            Three steps to a file a studio will accept
          </h2>
          <span className="section-kicker">No new tool to learn on set</span>
        </div>
        <div
          ref={stepsRef}
          className={`steps-wrap${stepsInView ? " in-view" : ""}`}
        >
          <div className="steps-line">
            <span className="steps-line-fill" />
          </div>
          <div className="steps">
            <div className="step">
              <div className="n mono">01</div>
              <h3>Upload the AI output</h3>
              <p>
                Drop in whatever came out of Midjourney, DALL·E, or your
                generator of choice.
              </p>
            </div>
            <div className="step">
              <div className="n mono">02</div>
              <h3>Get the reject report</h3>
              <p>
                We flag exactly what a studio would kick back — color mode,
                resolution, missing paths — before they ever see it.
              </p>
            </div>
            <div className="step">
              <div className="n mono">03</div>
              <h3>Download the production package</h3>
              <p>
                Vector paths where the art allows it, layered file where it
                doesn&apos;t, correct profile either way.
              </p>
            </div>
          </div>
        </div>
      </section>

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
              <div className="body">
                It&apos;s a flat PNG. The studio needs to resize a logo mark for
                a billboard and there&apos;s nothing to scale.
              </div>
            </div>
          </div>
          <div className="reject-row">
            <span className="mark">✕</span>
            <div className="reject-copy">
              <div className="head">RGB, not CMYK</div>
              <div className="body">
                Looks perfect on screen, shifts on press. Print production needs
                a proper color-managed file.
              </div>
            </div>
          </div>
          <div className="reject-row">
            <span className="mark">✕</span>
            <div className="reject-copy">
              <div className="head">One flattened layer</div>
              <div className="body">
                No way to isolate the type from the artwork, or pull the
                background out for a different format.
              </div>
            </div>
          </div>
          <div className="reject-row">
            <span className="mark">✕</span>
            <div className="reject-copy">
              <div className="head">72dpi at OOH scale</div>
              <div className="body">
                Fine for a Slack preview. Pixelates the moment it goes up on a
                wall four metres wide.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="studios" className="studios dark">
        <div className="section-head">
          <span className="section-num mono">03</span>
          <h2 className="section-title">
            Not just freelance handoffs — in-house too
          </h2>
          <span className="section-kicker">
            Agencies generate AI concepts internally. Same problem, no
            freelancer in the middle.
          </span>
        </div>
        <div className="quote-grid">
          <blockquote>
            &quot;Half our freelance rejections are the same three format issues.
            We just want a checkbox that says it&apos;s actually
            deliverable.&quot;
            <div className="cite">— Studio manager, mid-size agency</div>
          </blockquote>
          <blockquote>
            &quot;Our own creatives generate the concept in Midjourney. Then it
            sits for a day because nobody can turn it into something print can
            use.&quot;
            <div className="cite">— ECD, in-house creative team</div>
          </blockquote>
          <blockquote>
            &quot;I don&apos;t need the freelancer to know Illustrator. I need the
            file to open correctly the first time.&quot;
            <div className="cite">— Art buyer, independent agency</div>
          </blockquote>
        </div>
      </section>

      <section className="cta-section" id="waitlist">
        <div className="eyebrow" style={{ textAlign: "center" }}>
          Pre-release — get in before launch
        </div>
        <h2>Be first in line when the production package ships.</h2>
        <p className="sub">
          We&apos;re building the full press check and conversion pipeline now.
          Leave your email and you&apos;ll be among the first to try it — one
          email when it&apos;s ready, nothing else.
        </p>
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
