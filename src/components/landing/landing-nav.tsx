"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useScrollFrame } from "./use-scroll";

const LINKS = [
  { id: "problem", label: "Why" },
  { id: "templates", label: "Templates" },
  { id: "start", label: "Get started" },
];

/** Stacked-slides logo mark. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0a0c10" />
      <rect x="7" y="9.5" width="15" height="10" rx="2" fill="#fff" opacity="0.35" transform="rotate(-10 14.5 14.5)" />
      <rect x="9" y="11" width="16" height="10.5" rx="2" fill="#fff" />
      <rect x="11.5" y="14" width="7" height="1.6" rx="0.8" fill="#2f54eb" />
      <rect x="11.5" y="17.2" width="10" height="1.2" rx="0.6" fill="#0a0c10" opacity="0.35" />
    </svg>
  );
}

export function LandingNav() {
  const navRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<string | null>(null);

  useScrollFrame(() => {
    const nav = navRef.current;
    if (!nav) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    nav.style.setProperty("--progress", String(max > 0 ? window.scrollY / max : 0));
    nav.toggleAttribute("data-scrolled", window.scrollY > 8);
    let current: string | null = null;
    for (const { id } of LINKS) {
      const top = document.getElementById(id)?.getBoundingClientRect().top;
      if (top !== undefined && top <= window.innerHeight * 0.5) current = id;
    }
    setActive(current);
  });

  return (
    <nav ref={navRef} className="lp-nav" aria-label="Main">
      <div className="lp-nav-inner">
        <span className="lp-progress" aria-hidden />
        <a href="#intro" className="lp-brand">
          <Mark className="h-8 w-8" />
          <span>AI Lecture Studio</span>
        </a>
        <div className="lp-nav-links">
          {LINKS.map(({ id, label }) => (
            <a key={id} href={`#${id}`} className="lp-nav-link" aria-current={active === id ? "true" : undefined}>
              {label}
            </a>
          ))}
        </div>
        <Link href="/studio" className="lp-btn lp-btn-dark lp-btn-sm">
          Open Studio
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </nav>
  );
}
