import { buildSections, totalChars } from "@/lib/document/sections";
import type { AnalyzeRequest, WireBlock } from "@/lib/document/wire";
import { aiError, AppError } from "@/lib/utils/errors";
import type { AiConfig } from "./config";
import type { JsonGenerator } from "./gemini-client";
import { planWithAi, validationContext } from "./slide-planner";
import type { AiPlan } from "./schemas";

export type AnalyzeStage = "analyzing" | "planning";

export interface AnalyzeResult {
  plan: AiPlan;
  warnings: string[];
  meta: { model: string; mode: "single"; chunks: number; requests: number };
}

/**
 * Whole-document analysis in ONE request: sections → one validated slide plan. Only for documents up to
 * `singleCallChars`. Longer documents are processed step by step from the browser (chunk → consolidate →
 * plan, see step-handlers.ts and lib/analysis-job.ts), because one serverless request cannot reliably
 * outlast a long sequence of rate-limited Gemini calls.
 */
export async function analyzeDocument(
  request: AnalyzeRequest,
  config: AiConfig,
  generate: JsonGenerator,
  onStage: (stage: AnalyzeStage) => void = () => {},
  outerSignal?: AbortSignal,
): Promise<AnalyzeResult> {
  const blocks = request.blocks as WireBlock[];
  const sections = buildSections(blocks);
  const chars = totalChars(sections);

  const hasText = blocks.some((b) => b.type === "list" || b.type === "table" || ("text" in b && b.text.trim().length > 0));
  if (!hasText) {
    throw new AppError("empty-document", "This document has no text to turn into slides.");
  }
  if (chars > config.maxDocChars) throw aiError("payload-too-large");

  const deadline = AbortSignal.timeout(config.totalTimeoutMs);
  const signal = outerSignal ? AbortSignal.any([outerSignal, deadline]) : deadline;
  let requests = 0;
  const counted: JsonGenerator = (r, s) => {
    requests++;
    return generate(r, s ?? signal);
  };

  const sourceText = sections.map((s) => s.text).join("\n");
  const ctx = validationContext(blocks, sourceText, sections);
  const common = {
    sections,
    chars,
    density: request.density,
    preferDiagrams: !!request.preferDiagrams,
    documentTitle: request.title,
    fileName: request.fileName,
    ctx,
  };

  onStage("analyzing");
  try {
    if (chars > config.singleCallChars) throw aiError("payload-too-large", undefined, "This document is too long for a single request and must be processed in parts.");
    onStage("planning");
    const source = sections.map((s) => `=== ${s.id}${s.heading ? ` — "${s.heading}"` : ""} ===\n${s.text}`).join("\n\n");
    const { plan, warnings } = await planWithAi(counted, { ...common, source, sourceKind: "document" }, signal);
    return { plan, warnings, meta: { model: config.model, mode: "single", chunks: 1, requests } };
  } catch (error) {
    // A deadline/abort surfaces as a timeout, whatever layer noticed it first.
    if (signal.aborted && !(error instanceof AppError && error.code !== "timeout" && error.code !== "ai-unavailable")) {
      throw aiError(outerSignal?.aborted ? "network" : "timeout", error);
    }
    throw error;
  }
}
