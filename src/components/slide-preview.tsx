"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import type { ComposedDeck } from "@/lib/pptx/draw";
import type { SlideKind } from "@/lib/slides/types";
import { SlideCanvas } from "./slide-canvas";

const KIND_LABELS: Record<SlideKind, string> = {
  cover: "Cover",
  section: "Section",
  content: "Content",
  bullets: "Bullet points",
  twoColumn: "Two columns",
  definition: "Key concept",
  process: "Process",
  timeline: "Timeline",
  comparison: "Comparison",
  table: "Table",
  imageText: "Image + text",
  conclusion: "Takeaways",
};

interface Props {
  deck: ComposedDeck;
  kinds: SlideKind[];
}

export function SlidePreview({ deck, kinds }: Props) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const count = deck.slides.length;
  const safeIndex = Math.min(index, count - 1);

  const go = useCallback((delta: number) => setIndex((i) => Math.max(0, Math.min(count - 1, i + delta))), [count]);

  useEffect(() => {
    const thumb = stripRef.current?.querySelector<HTMLElement>(`[data-index="${safeIndex}"]`);
    thumb?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [safeIndex]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, go]);

  const slide = deck.slides[safeIndex];

  const nav = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => go(-1)}
        disabled={safeIndex === 0}
        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[4.5rem] text-center text-sm tabular-nums text-slate-600">
        {safeIndex + 1} / {count}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={safeIndex === count - 1}
        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        aria-label="Next slide"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div>
      <div
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
        className="rounded-2xl bg-slate-100 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:p-6"
        aria-label="Slide preview. Use the arrow keys to move between slides."
      >
        <div className="mx-auto max-w-4xl overflow-hidden rounded-lg shadow-[0_10px_40px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/5">
          <SlideCanvas slide={slide} width={deck.w} height={deck.h} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{KIND_LABELS[kinds[safeIndex]]} layout</span>
        {nav}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <Maximize2 className="h-4 w-4" aria-hidden /> Larger preview
        </button>
      </div>

      <div ref={stripRef} className="mt-5 flex gap-3 overflow-x-auto pb-2" role="listbox" aria-label="All slides">
        {deck.slides.map((s, i) => (
          <button
            key={i}
            data-index={i}
            type="button"
            role="option"
            aria-selected={i === safeIndex}
            onClick={() => setIndex(i)}
            className={`w-40 shrink-0 rounded-lg p-1 text-left transition sm:w-44 ${
              i === safeIndex ? "bg-brand-50 ring-2 ring-brand-500" : "hover:bg-slate-100"
            }`}
          >
            <div className="overflow-hidden rounded ring-1 ring-black/10">
              <SlideCanvas slide={s} width={deck.w} height={deck.h} />
            </div>
            <span className="mt-1 block truncate px-0.5 text-[11px] text-slate-500">
              {i + 1}. {s.title}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-400">
        The preview is an approximation. Fonts and line breaks may differ slightly in PowerPoint, Google Slides or LibreOffice.
      </p>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Larger slide preview"
          onClick={() => setExpanded(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Close preview"
            onClick={() => setExpanded(false)}
            autoFocus
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="w-full overflow-hidden rounded-lg shadow-2xl"
            style={{ maxWidth: `min(1400px, calc((100vh - 9rem) * ${deck.w / deck.h}))` }}
            onClick={(e) => e.stopPropagation()}
          >
            <SlideCanvas slide={slide} width={deck.w} height={deck.h} />
          </div>
          <div className="mt-4 rounded-xl bg-white p-1.5" onClick={(e) => e.stopPropagation()}>
            {nav}
          </div>
        </div>
      )}
    </div>
  );
}
