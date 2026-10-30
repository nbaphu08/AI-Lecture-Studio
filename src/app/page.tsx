import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { VideoBackground } from "@/components/video-background";

export const metadata: Metadata = {
  title: "AI Lecture Studio",
  description: "A platform where you can convert breakthrough ideas into eye-catching slides.",
};

export default function LandingPage() {
  return (
    <main className="landing relative isolate flex min-h-svh flex-col overflow-hidden bg-[#05070d] text-[#f3ece0]">
      <div className="absolute inset-0 -z-20">
        <VideoBackground src="/videos/mountain-stars.mp4" poster="/videos/mountain-stars-poster.jpg" />
      </div>
      <div className="landing-veil absolute inset-0 -z-10" aria-hidden />
      <div className="landing-grain absolute inset-0 -z-10" aria-hidden />

      <header className="rise flex items-center justify-between px-6 py-7 sm:px-12" style={{ animationDelay: "0.2s" }}>
        <span className="font-label text-[11px] font-semibold uppercase tracking-[0.42em] text-[#f3dfa8]">ALS</span>
        <Link
          href="/studio"
          className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-white/90 transition hover:text-[#f3dfa8] focus:outline-none focus-visible:text-[#f3dfa8]"
        >
          Open the Studio
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-6 pb-40 text-center sm:pb-48 lg:pb-64">
        <div className="rise gold-rule" style={{ animationDelay: "0.5s" }} aria-hidden />

        <h1 className="hero-title rise mt-9 font-display" style={{ animationDelay: "0.7s" }}>
          <span>AI</span> <span>LECTURE</span> <span>STUDIO</span>
        </h1>

        <p
          className="rise mt-8 max-w-[34rem] font-display text-[1.35rem] font-semibold italic leading-snug text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.6)] sm:text-[1.7rem]"
          style={{ animationDelay: "1.1s" }}
        >
          A platform where you can convert breakthrough ideas into eye-catching slides
        </p>

        <div className="rise mt-12" style={{ animationDelay: "1.5s" }}>
          <Link href="/studio" className="landing-cta group font-label">
            <span>Begin Creating</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1" aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}
