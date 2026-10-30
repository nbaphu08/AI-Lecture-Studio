import { Layers, ShieldCheck } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <Layers className="h-5 w-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">SlideCraft</p>
            <p className="hidden text-xs text-slate-500 sm:block">Turn your documents into beautiful presentations.</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Your files stay on your device.
        </span>
      </div>
    </header>
  );
}
