import { ArrowRight, FileText, Palette, Presentation } from "lucide-react";

const STEPS = [
  { icon: FileText, label: "Upload DOCX" },
  { icon: Palette, label: "Choose a Style" },
  { icon: Presentation, label: "Generate Slides" },
];

export function HeroSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 pt-14 text-center sm:px-6 sm:pt-20">
      <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        From Documents to <span className="text-brand-600">Beautiful Presentations</span>
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
        Upload your Word document and transform it into a professionally designed PowerPoint presentation in just a few clicks.
      </p>
      <ol className="mt-9 flex flex-wrap items-center justify-center gap-2 sm:gap-3" aria-label="How it works">
        {STEPS.map(({ icon: Icon, label }, i) => (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">{i + 1}</span>
              <Icon className="h-4 w-4 text-slate-500" aria-hidden />
              {label}
            </span>
            {i < STEPS.length - 1 && <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden />}
          </li>
        ))}
      </ol>
    </section>
  );
}
