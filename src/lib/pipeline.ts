import { parseDocx } from "@/lib/docx/parser";
import type { ParsedDocument } from "@/lib/docx/types";
import { resolveSettings } from "@/lib/design/style-hints";
import type { ComposedDeck } from "@/lib/pptx/draw";
import { generatePptxBlob } from "@/lib/pptx/generate";
import { inspectPptx } from "@/lib/pptx/pptx-utils";
import { composeValidated, issueWarnings } from "@/lib/pptx/slide-validator";
import { analyzeDocumentJob, createJobStore, type JobStats, type JobStore } from "@/lib/analysis-job";
import type { AiPlanResult } from "@/lib/analyze-client";
import type { Stage } from "@/lib/stages";
import { aiPlanToDeckPlan } from "@/lib/slides/ai-plan";
import type { EffectiveSettings, PresentationSettings } from "@/lib/settings";
import { planSlides } from "@/lib/slides/planner";
import type { DeckPlan } from "@/lib/slides/types";
import { AppError } from "@/lib/utils/errors";
import { baseName, toFileStem } from "@/lib/utils/file-utils";

export { STAGES, type Stage } from "@/lib/stages";
export type OnStage = (stage: Stage, detail?: string) => void;

export interface GenerationResult {
  plan: DeckPlan;
  deck: ComposedDeck;
  blob: Blob;
  downloadName: string;
  settings: EffectiveSettings;
  planner: "ai" | "basic";
  /** Request counts and chunking details of the AI analysis (absent when a cached plan was reused). */
  jobStats?: JobStats;
}

export interface BuildOptions {
  /** "basic" uses the built-in rule-based planner (no AI). Only chosen explicitly by the user. */
  planner?: "ai" | "basic";
  /** Previously received AI plan for the same document and planning inputs; skips the AI request. */
  cachedAiPlan?: AiPlanResult;
  onAiPlan?: (result: AiPlanResult) => void;
  /** Stages the AI analysis did not need (e.g. consolidating for a short document) are reported here. */
  onSkipped?: (stages: Stage[]) => void;
  /** Intermediate results of a large-document analysis; reuse the same store to resume after a failure. */
  store?: JobStore;
  /** Override for tests: where the AI endpoints live and how to fetch them. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Let the browser paint progress updates between the synchronous pipeline stages. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 120));

export async function readDocument(file: File, onStage: OnStage): Promise<ParsedDocument> {
  onStage("reading");
  await nextFrame();
  return parseDocx(file);
}

export async function buildPresentation(
  doc: ParsedDocument,
  fileName: string,
  rawSettings: PresentationSettings,
  onStage: OnStage,
  options: BuildOptions = {},
): Promise<GenerationResult> {
  const settings = resolveSettings(rawSettings);
  const planner = options.planner ?? "ai";
  let plan: DeckPlan;
  let jobStats: JobStats | undefined;

  if (planner === "basic") {
    onStage("planning");
    await nextFrame();
    try {
      plan = planSlides(doc, { density: settings.density, fileName, preferDiagrams: settings.preferDiagrams });
    } catch (error) {
      throw new AppError("plan-failed", "The document was read, but its structure could not be turned into slides.", { cause: error });
    }
    plan.warnings.unshift("This presentation was created with the basic offline planner instead of AI, so slides follow the document's headings more literally.");
  } else {
    let ai = options.cachedAiPlan;
    if (!ai) {
      const job = await analyzeDocumentJob(doc, {
        density: settings.density,
        preferDiagrams: settings.preferDiagrams,
        fileName,
        store: options.store ?? createJobStore(),
        onProgress: onStage,
        baseUrl: options.baseUrl,
        fetchImpl: options.fetchImpl,
        signal: options.signal,
        sleep: options.sleep,
      });
      ai = { plan: job.plan, warnings: job.warnings, model: job.model };
      jobStats = job.stats;
      options.onSkipped?.(job.stats.consolidationPasses === 0 ? ["consolidating"] : []);
      options.onAiPlan?.(ai);
    }
    try {
      plan = aiPlanToDeckPlan(ai.plan, doc, { density: settings.density }, ai.warnings);
    } catch (error) {
      throw new AppError("plan-failed", "The AI's plan could not be turned into slides. Please try again.", { cause: error });
    }
  }
  if (plan.slides.length <= 1) {
    throw new AppError("empty-document", "No usable content was found in this document, so there is nothing to put on slides.");
  }

  onStage("generating");
  await nextFrame();
  let fitted: ReturnType<typeof composeValidated>;
  try {
    fitted = composeValidated(plan, settings);
  } catch (error) {
    throw new AppError("generate-failed", "The slides could not be laid out with this design. Try another theme.", { cause: error });
  }
  const blob = await generatePptxBlob(fitted.deck, { title: fitted.plan.title });

  onStage("validating");
  await nextFrame();
  const inspection = await inspectPptx(blob, fitted.plan.slides.length);
  if (!inspection.ok) {
    throw new AppError("generate-failed", "The PowerPoint file did not pass validation. Please try again or choose a different theme.", {
      cause: new Error(inspection.problems.join("; ")),
    });
  }
  const finalPlan: DeckPlan = {
    ...fitted.plan,
    warnings: [...fitted.plan.warnings, ...issueWarnings(fitted.plan, fitted.issues)],
  };
  const stem = toFileStem(finalPlan.title, toFileStem(baseName(fileName)));
  return { plan: finalPlan, deck: fitted.deck, blob, downloadName: `${stem}.pptx`, settings, planner, jobStats };
}
