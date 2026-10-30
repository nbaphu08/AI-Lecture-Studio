"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Clock3, Pilcrow, Shapes } from "lucide-react";
import { SlideCanvas } from "@/components/slide-canvas";
import { SHOWCASE_DECKS } from "@/lib/design/showcase";
import { Mark } from "./landing-nav";
import { MessySlide } from "./messy-slide";
import { useReveal } from "./use-scroll";

const PAINS = [
  {
    icon: Clock3,
    title: "Hours lost to formatting",
    text: "Copy, paste, resize, realign. The time you needed for rehearsing disappears into text boxes.",
  },
  {
    icon: Pilcrow,
    title: "Walls of text",
    text: "Paragraphs pasted straight from the document, unreadable from the back row.",
  },
  {
    icon: Shapes,
    title: "Design that looks rushed",
    text: "Mismatched fonts, colors and spacing make strong work look careless.",
  },
];

const STATS = [
  { value: "12", label: "slide layouts" },
  { value: "6", label: "design themes" },
  { value: "0", label: "files uploaded" },
];

// The clean version of the messy slide: same words, Academic template.
const academic = SHOWCASE_DECKS[0].deck;
const AFTER_SLIDE = academic.slides[1];

type View = "before" | "after";

/** Before/after demo that tidies itself up shortly after it scrolls into view. */
function BeforeAfter() {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>("before");
  const manual = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (manual.current) return;
        if (entry.isIntersecting) timer = setTimeout(() => setView("after"), 1300);
        else setView("before");
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, []);

  const choose = (next: View) => {
    manual.current = true;
    setView(next);
  };

  return (
    <div ref={ref} className="lp-device" data-r style={{ "--d": 2 } as React.CSSProperties}>
      <div className="lp-device-bar">
        <span className="lp-device-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="lp-device-file">{view === "before" ? "lecture-4-final-FINAL-v3.pptx" : "Principles of Microeconomics.pptx"}</span>
        <div className="lp-toggle" role="group" aria-label="Compare slides">
          {(["before", "after"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => choose(v)}>
              {v === "before" ? "Before" : "After"}
            </button>
          ))}
        </div>
      </div>
      <div className="lp-demo" data-state={view}>
        <MessySlide />
        <div className="lp-demo-after">
          <SlideCanvas slide={AFTER_SLIDE} width={academic.w} height={academic.h} />
        </div>
        <span className="lp-demo-scan" aria-hidden />
        <span className="lp-demo-tag lp-demo-tag-before">Made by hand at 2 a.m.</span>
        <span className="lp-demo-tag lp-demo-tag-after">Made with AI Lecture Studio</span>
      </div>
    </div>
  );
}

export function Problem() {
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} id="problem" className="lp-problem lp-step" aria-labelledby="problem-title">
      <div className="lp-problem-grid">
        <div>
          <p className="lp-eyebrow lp-eyebrow-signal" data-r>
            <i aria-hidden />
            01 · The problem
          </p>
          <h2 id="problem-title" className="lp-h2" data-r style={{ "--d": 1 } as React.CSSProperties}>
            It’s 11 PM. The notes are done. <span className="lp-serif lp-signal">The slides aren’t.</span>
          </h2>
          <p className="lp-body" data-r style={{ "--d": 2 } as React.CSSProperties}>
            You spent weeks on the research. Now one night is left to turn twenty pages of Word into a deck, and every slide starts
            from a blank template.
          </p>
          <ul className="lp-pains">
            {PAINS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} data-r style={{ "--d": 3 + i } as React.CSSProperties}>
                <span className="lp-pain-icon">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div>
                  <p className="lp-pain-title">{title}</p>
                  <p className="lp-pain-text">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="lp-problem-side">
          <BeforeAfter />
          <div className="lp-fix" data-r style={{ "--d": 4 } as React.CSSProperties}>
            <div className="lp-fix-head">
              <Mark className="h-9 w-9 shrink-0" />
              <div>
                <p className="lp-fix-kicker">There’s a better way</p>
                <p className="lp-fix-title">Same words. Professional design.</p>
              </div>
            </div>
            <p className="lp-fix-text">
              AI Lecture Studio reads the structure of your document (headings, lists, tables and dates) and lays every slide out on a
              professional grid. Your text is never rewritten, only arranged.
            </p>
            <div className="lp-fix-foot">
              <dl className="lp-stats">
                {STATS.map(({ value, label }) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <a href="#templates" className="lp-link">
                See the templates
                <ArrowDown className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
