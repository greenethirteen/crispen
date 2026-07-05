import Link from "next/link";
import type { Metadata } from "next";
import CrispenLogo from "../../components/CrispenLogo";
import "../landing.css";

// noindex so search engines / crawlers don't load /thanks and inflate the
// conversion count — it should only be reached by real signups via redirect.
export const metadata: Metadata = {
  title: "You're on the list — Crispen",
  robots: { index: false, follow: false },
};

export default function ThanksPage() {
  return (
    <div className="repro-landing">
      <nav>
        <Link href="/" aria-label="Crispen home">
          <CrispenLogo className="site-logo" />
        </Link>
      </nav>

      <section className="thanks">
        <div className="thanks-mark">✓</div>
        <h1>You&apos;re on the list.</h1>
        <p>
          Thanks — we&apos;ll email you the moment Crispen ships. One email, no
          spam, no sharing your address.
        </p>
        <Link href="/" className="btn outline">
          ← Back to home
        </Link>
      </section>
    </div>
  );
}
