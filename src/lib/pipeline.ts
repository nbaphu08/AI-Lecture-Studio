import { parseDocx } from "@/lib/docx/parser";
import type { ParsedDocument } from "@/lib/docx/types";
import { resolveSettings } from "@/lib/design/style-hints";
import type { ComposedDeck } from "@/lib/pptx/draw";
import { generatePptxBlob } from "@/lib/pptx/generate";
import { inspectPptx } from "@/lib/pptx/pptx-utils";
import { composeValidated, issueWarnings } from "@/lib/pptx/slide-validator";
import { requestAiPlan, type AiPlanResult } from "@/lib/analyze-client";
import { aiPlanToDeckPlan } from "@/lib/slides/ai-plan";
import type { EffectiveSettings, PresentationSettings } from "@/lib/settings";
import { planSlides } from "@/lib/slides/planner";
import type { DeckPlan } from "@/lib/slides/types";
import { AppError } from "@/lib/utils/errors";
import { baseName, toFileStem } from "@/lib/utils/file-utils";

export type Stage = "reading" | "analyzing" | "summarizing" | "planning" | "generating" | "validating";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "reading", label: "Reading document" },
  { id: "analyzing", label: "Analyzing content" },
  { id: "summarizing", label: "Summarizing sections" },
  { id: "planning", label: "Planning slides" },
  { id: "generating", label: "Generating PowerPoint" },
  { id: "validating", label: "Validating presentation" },
];

export interface GenerationResult {
  plan: DeckPlan;
  deck: ComposedDeck;
  blob: Blob;
  downloadName: string;
  settings: EffectiveSettings;
  planner: "ai" | "basic";
}

export interface BuildOptions {
  /** "basic" uses the built-in rule-based planner (no AI). Only chosen explicitly by the user. */
  planner?: "ai" | "basic";
  /** Previously received AI plan for the same document and planning inputs; skips the AI request. */
  cachedAiPlan?: AiPlanResult;
  onAiPlan?: (result: AiPlanResult) => void;
  /** Stages the AI service did not need (e.g. summarizing for a short document) are reported here. */
  onSkipped?: (stages: Stage[]) => void;
}

/** Let the browser paint progress updates between the synchronous pipeline stages. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 120));

export async function readDocument(file: File, onStage: (s: Stage) => void): Promise<ParsedDocument> {
  onStage("reading");
  await nextFrame();
  return parseDocx(file);
}

export async function buildPresentation(
  doc: ParsedDocument,
  fileName: string,
  rawSettings: PresentationSettings,
  onStage: (s: Stage) => void,
  options: BuildOptions = {},
): Promise<GenerationResult> {
  const settings = resolveSettings(rawSettings);
  const planner = options.planner ?? "ai";
  let plan: DeckPlan;

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
      const seen = new Set<Stage>();
      ai = await requestAiPlan(
        doc,
        { density: settings.density, preferDiagrams: settings.preferDiagrams, fileName },
        (stage) => {
          seen.add(stage);
          onStage(stage);
        },
      );
      if (!seen.has("summarizing")) options.onSkipped?.(["summarizing"]);
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
  return { plan: finalPlan, deck: fitted.deck, blob, downloadName: `${stem}.pptx`, settings, planner };
}
