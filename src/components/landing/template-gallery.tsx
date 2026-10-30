"use client";

import { useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { SlideCanvas } from "@/components/slide-canvas";
import { SHOWCASE_DECKS } from "@/lib/design/showcase";
import { clamp, easeInOut, lerp, useScrollFrame } from "./use-scroll";

const COUNT = SHOWCASE_DECKS.length;
const pad = (n: number) => String(n).padStart(2, "0");

/** Space kept free above the focused slide for the nav and the template bar, in px. */
const TOP = 150;

/** Height kept for the details panel under the focused slide, in px. Its text wraps more on small screens. */
function infoHeight(vw: number, vh: number) {
  if (vw < 768) return 220;
  return vh < 800 ? 175 : 150;
}

/**
 * Pinned template gallery. The section is (templates + 1) screens tall and every screen of scroll is
 * one step: step 0 shows all templates side by side, step 1 zooms into the first one, and each
 * following step slides the next template in from the right.
 */
export function TemplateGallery() {
  const sectionRef = useRef<HTMLElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const infosRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const infos = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState<number[]>(() => SHOWCASE_DECKS.map(() => 0));

  useScrollFrame(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const mobile = vw < 768;

    // Scroll progress in steps: 0 = overview, 1 = first template, COUNT = last template.
    const step = (section.offsetHeight - vh) / COUNT;
    const p = clamp(-section.getBoundingClientRect().top / step, 0, COUNT);
    const zoom = easeInOut(clamp(p));
    const focus = p <= 1 ? lerp((COUNT - 1) / 2, 0, zoom) : p - 1;

    // Card size when focused: as wide as fits next to the bar, the details and a peek of the neighbors.
    const infoH = infoHeight(vw, vh);
    const w = mobile ? vw * 0.86 : Math.min(vw * 0.6, ((vh - TOP - infoH - 40) * 16) / 9, 1040);
    const h = (w * 9) / 16;
    const gap = w * 0.07;
    const fit = Math.min(1, (vw * (mobile ? 0.94 : 0.84)) / (COUNT * w + (COUNT - 1) * gap));
    const scale = lerp(fit, 1, zoom);

    const focusedY = TOP + Math.max(8, (vh - TOP - h - infoH - 24) / 2) + h / 2;
    const centerY = lerp(vh * (mobile ? 0.62 : 0.64), focusedY, zoom);
    const x = vw / 2 - scale * (focus * (w + gap) + w / 2);
    const y = centerY - (scale * h) / 2;

    track.style.setProperty("--w", `${w}px`);
    track.style.setProperty("--gap", `${gap}px`);
    track.style.setProperty("--inv", String(1 / scale));
    track.style.setProperty("--label", String(clamp(1 - zoom * 2.5)));
    track.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    cards.current.forEach((card, i) => {
      if (!card) return;
      const away = clamp(i - focus, -1, 1) * zoom;
      card.style.setProperty("--k", String(1 - 0.12 * Math.abs(away)));
      card.style.setProperty("--o", String(1 - 0.3 * Math.abs(away)));
      card.style.setProperty("--ry", `${-away * 10}deg`);
    });

    const intro = introRef.current;
    if (intro) {
      intro.style.opacity = String(clamp(1 - zoom * 1.8));
      intro.style.transform = `translate3d(0, ${-zoom * 70}px, 0)`;
    }
    if (hintRef.current) hintRef.current.style.opacity = String(clamp(1 - zoom * 3));

    const bar = barRef.current;
    if (bar) {
      const shownBar = clamp((zoom - 0.55) / 0.45);
      bar.style.opacity = String(shownBar);
      bar.style.transform = `translate3d(0, ${(1 - shownBar) * -16}px, 0)`;
      bar.inert = shownBar < 0.5;
    }
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${(clamp(focus, 0, COUNT - 1) + 1) / COUNT})`;

    const panel = infosRef.current;
    if (panel) {
      panel.style.left = `${(vw - w) / 2}px`;
      panel.style.top = `${focusedY + h / 2 + 24}px`;
      panel.style.width = `${w}px`;
    }
    const reveal = clamp((zoom - 0.6) / 0.4);
    infos.current.forEach((info, i) => {
      if (!info) return;
      const o = reveal * clamp(1 - Math.abs(focus - i) * 2.5);
      info.style.opacity = String(o);
      info.style.transform = `translate3d(${(i - focus) * 60}px, 0, 0)`;
      info.inert = o < 0.5;
    });

    setActive(Math.round(clamp(focus, 0, COUNT - 1)));
  });

  /** Scrolls to a step of the gallery (0 = overview, i + 1 = template i). */
  const goTo = (target: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const step = (section.offsetHeight - window.innerHeight) / COUNT;
    window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY + step * target, behavior: "smooth" });
  };

  return (
    <section
      ref={sectionRef}
      id="templates"
      className="lp-gallery"
      style={{ height: `${(COUNT + 1) * 100}svh` }}
      aria-labelledby="templates-title"
    >
      {Array.from({ length: COUNT + 1 }, (_, i) => (
        <span key={i} className="lp-snap" style={{ top: `${i * 100}svh` }} aria-hidden />
      ))}

      <div className="lp-gallery-stage">
        <div ref={introRef} className="lp-gintro">
          <p className="lp-eyebrow lp-eyebrow-accent">
            <i aria-hidden />
            02 · Templates
          </p>
          <h2 id="templates-title" className="lp-h2">
            Five templates. <span className="lp-serif lp-accent">Zero design skills needed.</span>
          </h2>
          <p className="lp-body">
            Each template has its own cover, section dividers, diagrams, tables and typography. These previews come from the same engine
            that builds your deck, so what you see here is what you download.
          </p>
        </div>

        <div ref={barRef} className="lp-gbar">
          <p className="lp-eyebrow lp-eyebrow-accent lp-gbar-label">
            <i aria-hidden />
            Templates
          </p>
          <div className="lp-tabs">
            {SHOWCASE_DECKS.map(({ themeId, name }, i) => (
              <button key={themeId} type="button" aria-current={active === i ? "true" : undefined} onClick={() => goTo(i + 1)}>
                {name}
              </button>
            ))}
          </div>
          <p className="lp-count" aria-live="polite">
            <b>{pad(active + 1)}</b> / {pad(COUNT)}
          </p>
          <span className="lp-gbar-line" aria-hidden>
            <span ref={fillRef} />
          </span>
        </div>

        <div ref={trackRef} className="lp-track">
          {SHOWCASE_DECKS.map(({ themeId, name, deck }, i) => (
            <div
              key={themeId}
              ref={(el) => {
                cards.current[i] = el;
              }}
              className="lp-card"
              onClick={() => goTo(i + 1)}
            >
              <span className="lp-card-stack" aria-hidden />
              <div className="lp-card-slide">
                <SlideCanvas slide={deck.slides[shown[i]]} width={deck.w} height={deck.h} />
              </div>
              <span className="lp-card-label" aria-hidden>
                <b>{pad(i + 1)}</b>
                {name}
              </span>
            </div>
          ))}
        </div>

        <p ref={hintRef} className="lp-ghint">
          Keep scrolling to browse them one by one
          <ArrowDown className="h-4 w-4" aria-hidden />
        </p>

        <div ref={infosRef} className="lp-infos">
          {SHOWCASE_DECKS.map(({ themeId, name, subject, pitch, traits, plan, deck }, i) => (
            <div
              key={themeId}
              ref={(el) => {
                infos.current[i] = el;
              }}
              className="lp-info"
            >
              <div className="lp-info-main">
                <span className="lp-info-num">{pad(i + 1)}</span>
                <div className="min-w-0">
                  <h3 className="lp-info-name">{name}</h3>
                  <p className="lp-info-subject">
                    {subject} · {plan.title}
                  </p>
                </div>
              </div>
              <div className="lp-thumbs" role="group" aria-label={`${name} sample slides`}>
                {deck.slides.map((slide, j) => (
                  <button
                    key={j}
                    type="button"
                    aria-pressed={shown[i] === j}
                    aria-label={`Preview slide ${j + 1}: ${slide.title}`}
                    onClick={() => setShown((s) => s.map((v, k) => (k === i ? j : v)))}
                  >
                    <SlideCanvas slide={slide} width={deck.w} height={deck.h} />
                  </button>
                ))}
              </div>
              <p className="lp-info-pitch">{pitch}</p>
              <ul className="lp-tags">
                {traits.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
