import type { Section } from "@/lib/document/sections";
import type { WireBlock } from "@/lib/document/wire";
import type { Density } from "@/lib/slides/types";
import { aiError } from "@/lib/utils/errors";
import type { JsonGenerator } from "./gemini-client";
import { dropEmptySlides, validatePlan, type ValidationContext } from "./plan-validation";
import { buildPlanPrompt, buildRepairPrompt, PLANNER_SYSTEM } from "./prompts";
import { PLAN_JSON_SCHEMA, type AiPlan } from "./schemas";

export interface PlanInput {
  /** Document text, or formatted chunk digests. */
  source: string;
  sourceKind: "document" | "digests";
  sections: Section[];
  chars: number;
  density: Density;
  preferDiagrams: boolean;
  documentTitle?: string;
  fileName?: string;
  ctx: ValidationContext;
}

export function validationContext(blocks: WireBlock[], sourceText: string, sections: Section[]): ValidationContext {
  return {
    sectionIds: new Set(sections.map((s) => s.id)),
    tableIds: new Set(blocks.filter((b) => b.type === "table").map((b) => b.id)),
    imageIds: new Set(blocks.filter((b) => b.type === "image").map((b) => b.id)),
    sourceText,
  };
}

/**
 * Ask Gemini for the slide plan in one structured request, validate it, and give it one controlled
 * chance to repair itself. Throws `invalid-ai-response` if the result still cannot be trusted.
 */
export async function planWithAi(generate: JsonGenerator, input: PlanInput, signal?: AbortSignal): Promise<{ plan: AiPlan; warnings: string[] }> {
  const prompt = buildPlanPrompt({
    source: input.source,
    sourceKind: input.sourceKind,
    sectionIds: input.sections.map((s) => s.id),
    chars: input.chars,
    density: input.density,
    preferDiagrams: input.preferDiagrams,
    documentTitle: input.documentTitle,
    fileName: input.fileName,
  });
  const request = { system: PLANNER_SYSTEM, prompt, jsonSchema: PLAN_JSON_SCHEMA, maxOutputTokens: 40_000 };

  const first = await generate(request, signal);
  const a = validatePlan(first, input.ctx);
  if (a.plan && !a.problems.length) return { plan: a.plan, warnings: a.warnings };

  const second = await generate({ ...request, prompt: buildRepairPrompt(prompt, first, a.problems) }, signal);
  const b = validatePlan(second, input.ctx);
  if (!b.plan) throw aiError("invalid-ai-response", new Error(b.problems.join("; ")));
  if (!b.problems.length) return { plan: b.plan, warnings: b.warnings };

  // Only slides that are individually unusable remain: leave them out and say so.
  const trimmed = dropEmptySlides(b.plan);
  if (trimmed.plan.slides.length < 2) throw aiError("invalid-ai-response", new Error(b.problems.join("; ")));
  return { plan: trimmed.plan, warnings: [...b.warnings, ...trimmed.warnings] };
}
