import { chunkToText, type Chunk } from "@/lib/document/chunker";
import { aiError } from "@/lib/utils/errors";
import type { JsonGenerator } from "./gemini-client";
import { digestsText, type SectionRef } from "./digest-utils";
import { buildConsolidatePrompt, buildDigestPrompt, buildRepairPrompt, ANALYZER_SYSTEM } from "./prompts";
import { DIGEST_JSON_SCHEMA, digestSchema, type ChunkDigest } from "./schemas";
import { parseJson } from "./plan-validation";

/** Analysis of one chunk: concepts, definitions, examples and data per section, with source ids. */

function validateDigest(raw: string, expectedSections: Set<string>): { digest?: ChunkDigest; problems: string[] } {
  const parsed = parseJson(raw);
  if (parsed.problem) return { problems: [parsed.problem] };
  const result = digestSchema.safeParse(parsed.value);
  if (!result.success) return { problems: result.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`) };

  const digest = result.data;
  digest.sections = digest.sections.filter((s) => expectedSections.has(s.sectionId));
  const missing = Array.from(expectedSections).filter((id) => !digest.sections.some((s) => s.sectionId === id));
  if (missing.length) return { problems: [`Missing entries for sections: ${missing.join(", ")}.`], digest };
  return { digest, problems: [] };
}

export async function analyzeChunk(
  generate: JsonGenerator,
  chunk: Chunk,
  index: number,
  total: number,
  signal?: AbortSignal,
): Promise<ChunkDigest> {
  const expected = new Set(chunk.parts.map((p) => p.sectionId));
  const prompt = buildDigestPrompt(chunkToText(chunk), index + 1, total);
  const request = { system: ANALYZER_SYSTEM, prompt, jsonSchema: DIGEST_JSON_SCHEMA, maxOutputTokens: 24_000 };

  const first = await generate(request, signal);
  const a = validateDigest(first, expected);
  if (a.digest && !a.problems.length) return a.digest;

  // One controlled repair attempt, then give up with a clear error.
  const second = await generate({ ...request, prompt: buildRepairPrompt(prompt, first, a.problems) }, signal);
  const b = validateDigest(second, expected);
  if (b.digest && !b.problems.length) return b.digest;
  throw Object.assign(aiError("invalid-ai-response", new Error(b.problems.join("; "))), { retryable: true });
}

/**
 * Compress a batch of section analyses (stage D). The model sees only these compact analyses, never the
 * original text. The result must still contain every section of the batch.
 */
export async function consolidateDigests(
  generate: JsonGenerator,
  batch: ChunkDigest[],
  sections: SectionRef[],
  targetChars: number,
  signal?: AbortSignal,
): Promise<ChunkDigest> {
  const expected = new Set(batch.flatMap((d) => d.sections.map((s) => s.sectionId)));
  const prompt = buildConsolidatePrompt(digestsText(batch, sections), targetChars);
  const request = { system: ANALYZER_SYSTEM, prompt, jsonSchema: DIGEST_JSON_SCHEMA, maxOutputTokens: 24_000 };
  const first = await generate(request, signal);
  const a = validateDigest(first, expected);
  if (a.digest && !a.problems.length) return a.digest;
  const second = await generate({ ...request, prompt: buildRepairPrompt(prompt, first, a.problems) }, signal);
  const b = validateDigest(second, expected);
  if (b.digest && !b.problems.length) return b.digest;
  throw Object.assign(aiError("invalid-ai-response", new Error(b.problems.join("; "))), { retryable: true });
}
