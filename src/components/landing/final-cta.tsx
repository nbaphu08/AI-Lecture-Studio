"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { useReveal } from "./use-scroll";

const CHECKS = ["No sign-up needed", "Runs entirely in your browser", "Editable .pptx you own"];

export function FinalCta() {
  const ref = useReveal<HTMLElement>();
  const router = useRouter();
  const buttonRef = useRef<HTMLAnchorElement>(null);
  const curtainRef = useRef<HTMLDivElement>(null);

  // Grow the studio's backdrop out of the button, then navigate underneath it.
  const onNavigate = (e: { preventDefault: () => void }) => {
    const curtain = curtainRef.current;
    const button = buttonRef.current;
    if (!curtain || !button || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.preventDefault();
    const r = button.getBoundingClientRect();
    curtain.style.setProperty("--cx", `${r.left + r.width / 2}px`);
    curtain.style.setProperty("--cy", `${r.top + r.height / 2}px`);
    curtain.getBoundingClientRect(); // commit the start position before the transition begins
    curtain.dataset.open = "";
    setTimeout(() => router.push("/studio"), 650);
  };

  return (
    <>
      <section ref={ref} id="start" className="lp-cta lp-step" aria-labelledby="start-title">
        <div className="lp-cta-photo" aria-hidden>
          <Image src="/images/landing-curves.jpg" alt="" fill sizes="100vw" />
        </div>
        <div className="lp-cta-veil" aria-hidden />
        <div className="lp-cta-glow" aria-hidden />

        <div className="lp-cta-content">
          <p className="lp-eyebrow lp-eyebrow-accent" data-r>
            <i aria-hidden />
            03 · Get started
          </p>
          <h2 id="start-title" className="lp-h2 lp-h2-xl" data-r style={{ "--d": 1 } as React.CSSProperties}>
            Your next lecture deserves <span className="lp-serif lp-accent">better slides.</span>
          </h2>
          <p className="lp-body lp-body-center" data-r style={{ "--d": 2 } as React.CSSProperties}>
            Upload a Word document, choose a template and download an editable PowerPoint. No sign-up, nothing to install, and your files
            never leave your device.
          </p>
          <div data-r style={{ "--d": 3 } as React.CSSProperties}>
            <Link ref={buttonRef} href="/studio" onNavigate={onNavigate} className="lp-start">
              <span className="lp-start-label">STARTING</span>
              <span className="lp-start-arrow" aria-hidden>
                <ArrowRight className="h-5 w-5" />
              </span>
            </Link>
          </div>
          <ul className="lp-checks" data-r style={{ "--d": 4 } as React.CSSProperties}>
            {CHECKS.map((c) => (
              <li key={c}>
                <Check className="h-4 w-4" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
        </div>

        <footer className="lp-footer">
          <span>© 2026 AI Lecture Studio</span>
          <span>
            Background photo by{" "}
            <a href="https://unsplash.com/@pawel_czerwinski" target="_blank" rel="noreferrer">
              Pawel Czerwinski
            </a>{" "}
            on Unsplash
          </span>
        </footer>
      </section>
      {/* Outside the section, whose isolation would otherwise keep it under the nav. */}
      <div ref={curtainRef} className="lp-curtain" aria-hidden />
    </>
  );
}
