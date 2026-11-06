import Link from "next/link";
import { Layers } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-20 glass-bar border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="AI Lecture Studio home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-on-gold shadow-sm">
            <Layers className="h-5 w-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">AI Lecture Studio</p>
            <p className="hidden text-xs text-fg-muted sm:block">Turn your documents into beautiful presentations.</p>
          </div>
        </Link>
        <figure className="hidden max-w-sm text-right md:block">
          <blockquote className="font-display text-[15px] italic leading-snug text-fg-soft">
            “Perfection is achieved when there is nothing left to take away.”
          </blockquote>
          <figcaption className="mt-0.5 text-[11px] uppercase tracking-wider text-fg-muted">Antoine de Saint-Exupéry</figcaption>
        </figure>
      </div>
    </header>
  );
}
