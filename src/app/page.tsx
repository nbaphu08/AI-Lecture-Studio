import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { LandingNav } from "@/components/landing/landing-nav";
import { Problem } from "@/components/landing/problem";
import { TemplateGallery } from "@/components/landing/template-gallery";
import "./landing.css";

const sans = Geist({ subsets: ["latin", "vietnamese"], variable: "--font-lp-sans" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-lp-serif" });

export const metadata: Metadata = {
  title: "AI Lecture Studio — Professional slides from your lecture notes",
  description: "Turn a Word document into a professionally designed, fully editable PowerPoint deck. Everything runs in your browser.",
};

export default function LandingPage() {
  return (
    <main className={`lp ${sans.variable} ${serif.variable}`}>
      <LandingNav />
      <Hero />
      <Problem />
      <TemplateGallery />
      <FinalCta />
    </main>
  );
}
