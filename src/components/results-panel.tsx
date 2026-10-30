"use client";

import { AlertTriangle, CheckCircle2, Download, RotateCcw } from "lucide-react";
import type { GenerationResult } from "@/lib/pipeline";
import { formatFileSize } from "@/lib/utils/file-utils";
import { SlidePreview } from "./slide-preview";

interface Props {
  result: GenerationResult;
  onDownload: () => void;
  onRegenerate: () => void;
  busy?: boolean;
}

export function ResultsPanel({ result, onDownload, onRegenerate, busy }: Props) {
  const { plan, deck, blob, downloadName } = result;
  const { coverage } = plan;
  const placed = coverage.assigned.length;

  return (
    <section id="results" className="rounded-3xl border border-edge bg-panel/90 p-5 backdrop-blur sm:p-8" aria-labelledby="results-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-300">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Your presentation is ready
          </p>
          <h2 id="results-title" className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-fg">
            {plan.title}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {plan.slides.length} slides · {formatFileSize(blob.size)} · {placed} of {coverage.totalBlocks} content blocks placed
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-edge-strong bg-well px-4 text-sm font-medium text-fg-soft transition hover:bg-well-hi disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Generate Again
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-on-gold shadow-sm transition hover:bg-brand-700"
          >
            <Download className="h-4 w-4" aria-hidden /> Download PowerPoint
          </button>
        </div>
      </div>

      {(plan.warnings.length > 0 || coverage.unsupported.length > 0) && (
        <div className="mt-5 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4" aria-hidden /> A few things to check
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
            {Array.from(new Set(plan.warnings)).map((w) => (
              <li key={w}>{w}</li>
            ))}
            {coverage.unsupported.map((u) => (
              <li key={u.id}>{u.reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <SlidePreview deck={deck} kinds={plan.slides.map((s) => s.kind)} />
      </div>
      <p className="sr-only">File name: {downloadName}</p>
    </section>
  );
}
