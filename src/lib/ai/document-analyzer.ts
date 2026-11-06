import { chunkToText, type Chunk } from "@/lib/document/chunker";
import type { Section } from "@/lib/document/sections";
import type { WireBlock } from "@/lib/document/wire";
import { aiError } from "@/lib/utils/errors";
import type { JsonGenerator } from "./gemini-client";
import { buildDigestPrompt, buildRepairPrompt, ANALYZER_SYSTEM } from "./prompts";
import { DIGEST_JSON_SCHEMA, digestSchema, type ChunkDigest } from "./schemas";
import { parseJson } from "./plan-validation";

const MAX_TABLE_ROWS = 30;

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
  throw aiError("invalid-ai-response", new Error(b.problems.join("; ")));
}

/** Run `fn` over `items` with at most `limit` in flight, preserving result order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Digests of all chunks as text for the planning request, in document order. Sections that were
 * split across chunks are merged. Tables and images follow verbatim so slides can reference them.
 */
export function formatDigests(digests: ChunkDigest[], sections: Section[], blocks: WireBlock[]): string {
  const bySection = new Map<string, ChunkDigest["sections"][number][]>();
  for (const d of digests) for (const s of d.sections) bySection.set(s.sectionId, [...(bySection.get(s.sectionId) ?? []), s]);

  const parts = sections.map((section) => {
    const entries = bySection.get(section.id) ?? [];
    const lines = [`=== ${section.id}${section.heading ? ` — "${section.heading}"` : ""} ===`];
    for (const e of entries) {
      if (e.topic) lines.push(`Topic: ${e.topic}`);
      lines.push(`Summary: ${e.summary}`);
      if (e.learningObjectives?.length) lines.push(`Learning objectives: ${e.learningObjectives.join("; ")}`);
      for (const p of e.points) {
        const label = p.term ? `${p.kind}, term "${p.term}"` : p.kind;
        lines.push(`- (${label}; ${p.importance}${p.sourceBlocks?.length ? `; ${p.sourceBlocks.join(",")}` : ""}) ${p.text}`);
      }
    }
    if (!entries.length) lines.push("(no analysis available; the original text follows)", section.text);
    return lines.join("\n");
  });

  const tables = blocks.flatMap((b) =>
    b.type === "table"
      ? [`[${b.id}] TABLE${b.rows.length > MAX_TABLE_ROWS ? ` (first ${MAX_TABLE_ROWS} of ${b.rows.length} rows)` : ""}:\n${[...(b.headers ? [b.headers] : []), ...b.rows.slice(0, MAX_TABLE_ROWS)].map((r) => r.join(" | ")).join("\n")}`]
      : [],
  );
  const images = blocks.flatMap((b) => (b.type === "image" ? [`[${b.id}] IMAGE${b.alt ? `: ${b.alt}` : ""}`] : []));

  return [
    ...parts,
    ...(tables.length ? ["=== TABLES OF THE DOCUMENT (reference them by block id) ===", ...tables] : []),
    ...(images.length ? ["=== IMAGES OF THE DOCUMENT (reference them by block id) ===", ...images] : []),
  ].join("\n\n");
}
