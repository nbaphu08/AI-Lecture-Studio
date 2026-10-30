"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Wand2 } from "lucide-react";
import { DesignSettings } from "@/components/design-settings";
import { GenerationProgress } from "@/components/generation-progress";
import { Header } from "@/components/header";
import { HeroSection } from "@/components/hero-section";
import { ResultsPanel } from "@/components/results-panel";
import { UploadDropzone } from "@/components/upload-dropzone";
import type { ParsedDocument } from "@/lib/docx/types";
import { validateDocxFile } from "@/lib/docx/validation";
import { buildPresentation, readDocument, type GenerationResult, type Stage } from "@/lib/pipeline";
import { DEFAULT_SETTINGS, type PresentationSettings } from "@/lib/settings";
import { toUserMessage } from "@/lib/utils/errors";

const SAMPLE_FILE = "sample-renewable-energy.docx";

type Status = { kind: "idle" } | { kind: "working"; stage: Stage } | { kind: "error"; message: string };

function Card({ step, title, description, children }: { step: number; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{step}</span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PresentationSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  // Parsed document cache so "Generate Again" with new settings skips re-reading the file.
  const parsedRef = useRef<{ file: File; doc: ParsedDocument } | null>(null);
  const workingRef = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const working = status.kind === "working";
  const settingsKey = JSON.stringify(settings);

  const reset = useCallback(() => {
    parsedRef.current = null;
    setResult(null);
    setResultKey(null);
    setStatus({ kind: "idle" });
  }, []);

  const handleFile = useCallback(
    (f: File) => {
      const message = validateDocxFile(f);
      reset();
      if (message) {
        setFile(null);
        setFileError(message);
        return;
      }
      setFileError(null);
      setFile(f);
    },
    [reset],
  );

  const handleClear = useCallback(() => {
    setFile(null);
    setFileError(null);
    reset();
  }, [reset]);

  const trySample = useCallback(async () => {
    setSampleLoading(true);
    try {
      const res = await fetch(SAMPLE_FILE);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      handleFile(new File([blob], SAMPLE_FILE, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    } catch (error) {
      setFileError(toUserMessage(error, "The sample document could not be loaded."));
    } finally {
      setSampleLoading(false);
    }
  }, [handleFile]);

  const generate = useCallback(async () => {
    if (!file || workingRef.current) return; // prevents duplicate processing on double clicks
    workingRef.current = true;
    const onStage = (stage: Stage) => setStatus({ kind: "working", stage });
    try {
      let doc = parsedRef.current?.file === file ? parsedRef.current.doc : null;
      if (!doc) {
        doc = await readDocument(file, onStage);
        parsedRef.current = { file, doc };
      }
      const next = await buildPresentation(doc, file.name, settings, onStage);
      setResult(next);
      setResultKey(JSON.stringify(settings));
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({ kind: "error", message: toUserMessage(error, "Something went wrong while creating your presentation. Please try again.") });
    } finally {
      workingRef.current = false;
    }
  }, [file, settings]);

  // Bring the results into view once a new presentation is ready.
  useEffect(() => {
    if (result) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const download = useCallback(() => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [result]);

  const stale = result !== null && resultKey !== settingsKey;

  return (
    <>
      <Header />
      <main className="pb-24">
        <HeroSection />

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-start">
          <div className="min-w-0 space-y-6 lg:sticky lg:top-24">
            <Card step={1} title="Upload your document" description="A Word (.docx) file with headings works best.">
              <UploadDropzone
                file={file}
                error={fileError}
                disabled={working}
                onFile={handleFile}
                onClear={handleClear}
                onTrySample={trySample}
                sampleLoading={sampleLoading}
              />
            </Card>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <button
                type="button"
                onClick={generate}
                disabled={!file || working}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {working ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Wand2 className="h-5 w-5" aria-hidden />}
                {working ? "Generating…" : "Generate Presentation"}
              </button>
              {!file && <p className="mt-3 text-center text-xs text-slate-500">Upload a document to get started.</p>}
              {stale && !working && (
                <p className="mt-3 text-center text-xs text-amber-700">Settings changed since the last version — generate again to apply them.</p>
              )}
              {working && (
                <div className="mt-4">
                  <GenerationProgress stage={status.stage} />
                </div>
              )}
              {status.kind === "error" && (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div>
                    <p>{status.message}</p>
                    <button type="button" onClick={() => setStatus({ kind: "idle" })} className="mt-1 font-medium underline underline-offset-2">
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <Card step={2} title="Choose a design" description="Pick a theme and fine-tune it. Thumbnails update live.">
            <DesignSettings settings={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} disabled={working} />
          </Card>
        </div>

        {result && (
          <div ref={resultsRef} className="mx-auto mt-10 max-w-6xl scroll-mt-24 px-4 sm:px-6">
            <ResultsPanel result={result} onDownload={download} onRegenerate={generate} busy={working} />
          </div>
        )}
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        SlideCraft · Rule-based presentation generator · Runs entirely in your browser
      </footer>
    </>
  );
}
