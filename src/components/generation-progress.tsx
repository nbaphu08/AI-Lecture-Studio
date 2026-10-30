import { Check, Loader2 } from "lucide-react";
import { STAGES, type Stage } from "@/lib/pipeline";

export function GenerationProgress({ stage }: { stage: Stage }) {
  const current = STAGES.findIndex((s) => s.id === stage);
  return (
    <div aria-live="polite" className="rounded-xl border border-edge bg-well p-4">
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-edge">
        <div className="h-full rounded-full bg-brand-600 transition-all duration-300" style={{ width: `${((current + 1) / STAGES.length) * 100}%` }} />
      </div>
      <ol className="space-y-1.5">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.id} className={`flex items-center gap-2.5 text-sm ${done ? "text-fg-muted" : active ? "font-medium text-fg" : "text-fg-muted"}`}>
              <span className="flex h-5 w-5 items-center justify-center">
                {done ? (
                  <Check className="h-4 w-4 text-emerald-400" aria-hidden />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-edge-strong" />
                )}
              </span>
              {s.label}
              {active && <span className="sr-only">(in progress)</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
