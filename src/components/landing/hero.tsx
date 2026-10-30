"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { SlideCanvas } from "@/components/slide-canvas";
import { SHOWCASE_DECKS } from "@/lib/design/showcase";
import { clamp, useScrollFrame } from "./use-scroll";

/** Fan angles, from the left card to the right one. The middle card sits on top. */
const ANGLES = [-20, -10, 0, 10, 20];

export function Hero() {
  const ref = useRef<HTMLElement>(null);

  // 0 while the hero fills the screen, 1 once it has scrolled away.
  useScrollFrame(() => {
    ref.current?.style.setProperty("--h", clamp(window.scrollY / window.innerHeight).toFixed(4));
  });

  return (
    <section ref={ref} id="intro" className="lp-hero lp-step" aria-labelledby="intro-title">
      <div className="lp-hero-photo" aria-hidden>
        <Image src="/images/landing-curves.jpg" alt="" fill priority sizes="100vw" />
      </div>
      <div className="lp-hero-veil" aria-hidden />
      <div className="lp-dots" aria-hidden />

      <div className="lp-hero-content">
        <p className="lp-chip lp-enter" style={{ "--d": 1 } as React.CSSProperties}>
          <b>New</b>
          Word to PowerPoint, right in your browser
        </p>
        <h1 id="intro-title" className="lp-title lp-enter" style={{ "--d": 2 } as React.CSSProperties}>
          AI <span className="lp-serif">Lecture</span> Studio
        </h1>
        <p className="lp-lede lp-enter" style={{ "--d": 3 } as React.CSSProperties}>
          Turn your lecture notes into a polished, fully editable slide deck. Upload a Word document, choose a professional template,
          and walk into class ready to present.
        </p>
        <div className="lp-hero-actions lp-enter" style={{ "--d": 4 } as React.CSSProperties}>
          <Link href="/studio" className="lp-btn lp-btn-dark">
            Start creating
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <a href="#templates" className="lp-btn lp-btn-light">
            Explore templates
          </a>
        </div>
      </div>

      <div className="lp-fan" aria-hidden>
        {SHOWCASE_DECKS.map(({ themeId, deck }, i) => (
          <div
            key={themeId}
            className="lp-fan-card"
            style={{ "--r": `${ANGLES[i]}deg`, "--i": i, zIndex: 10 - Math.abs(i - 2) } as React.CSSProperties}
          >
            <div className="lp-fan-inner">
              <SlideCanvas slide={deck.slides[0]} width={deck.w} height={deck.h} />
            </div>
          </div>
        ))}
      </div>

      <a href="#problem" className="lp-scroll-cue">
        <span>Scroll to explore</span>
        <ChevronDown className="h-4 w-4" aria-hidden />
      </a>
    </section>
  );
}
