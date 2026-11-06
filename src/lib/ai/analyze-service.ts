import { chunkSections } from "@/lib/document/chunker";
import { buildSections, totalChars } from "@/lib/document/sections";
import type { AnalyzeRequest, WireBlock } from "@/lib/document/wire";
import { aiError, AppError } from "@/lib/utils/errors";
import type { AiConfig } from "./config";
import { analyzeChunk, formatDigests, mapWithConcurrency } from "./document-analyzer";
import type { JsonGenerator } from "./gemini-client";
import { planWithAi, validationContext } from "./slide-planner";
import type { AiPlan } from "./schemas";

export type AnalyzeStage = "analyzing" | "summarizing" | "planning";

export interface AnalyzeResult {
  plan: AiPlan;
  warnings: string[];
  meta: { model: string; mode: "single" | "chunked"; chunks: number; requests: number };
}

/**
 * Server-side orchestration: sections → (chunks → digests) → one validated slide plan.
 *
 * Short documents need a single request. Long documents are cut into chunks along their sections,
 * each chunk is analyzed on its own (sequentially by default, to respect free-tier rate limits) and the
 * digests are consolidated into one plan so repeated information is merged.
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
    if (chars <= config.singleCallChars) {
      onStage("planning");
      const source = sections.map((s) => `=== ${s.id}${s.heading ? ` — "${s.heading}"` : ""} ===\n${s.text}`).join("\n\n");
      const { plan, warnings } = await planWithAi(counted, { ...common, source, sourceKind: "document" }, signal);
      return { plan, warnings, meta: { model: config.model, mode: "single", chunks: 1, requests } };
    }

    const chunks = chunkSections(sections, config.chunkChars);
    onStage("summarizing");
    const digests = await mapWithConcurrency(chunks, config.concurrency, (chunk, i) => analyzeChunk(counted, chunk, i, chunks.length, signal));
    onStage("planning");
    const source = formatDigests(digests, sections, blocks);
    const { plan, warnings } = await planWithAi(counted, { ...common, source, sourceKind: "digests" }, signal);
    return { plan, warnings, meta: { model: config.model, mode: "chunked", chunks: chunks.length, requests } };
  } catch (error) {
    // A deadline/abort surfaces as a timeout, whatever layer noticed it first.
    if (signal.aborted && !(error instanceof AppError && error.code !== "timeout" && error.code !== "ai-unavailable")) {
      throw aiError(outerSignal?.aborted ? "network" : "timeout", error);
    }
    throw error;
  }
}
