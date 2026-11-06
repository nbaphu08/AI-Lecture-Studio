import { chunkSections, chunkToText, type Chunk } from "@/lib/document/chunker";
import { buildSections, totalChars } from "@/lib/document/sections";
import { toWireDocument, type WireBlock } from "@/lib/document/wire";
import type { ParsedDocument } from "@/lib/docx/types";
import { digestsText, dropToFit, formatDigests, type SectionRef } from "@/lib/ai/digest-utils";
import { extractNumbers } from "@/lib/ai/plan-validation";
import type { ErrorBody } from "@/lib/ai/protocol";
import { slideRange, SLIDES_PER_PLAN_REQUEST } from "@/lib/ai/prompts";
import { planSchema, type AiPlan, type ChunkDigest } from "@/lib/ai/schemas";
import type { Section } from "@/lib/document/sections";
import type { Limits } from "@/lib/ai/step-schemas";
import { fromBody, requestAiPlan, type AiPlanResult } from "@/lib/analyze-client";
import type { Stage } from "@/lib/stages";
import type { Density } from "@/lib/slides/types";
import { backoffDelay, runPool, sleep as realSleep } from "@/lib/utils/async";
import { AppError, aiError } from "@/lib/utils/errors";

/**
 * Browser-side orchestration of a large-document analysis. The browser is the job coordinator:
 *
 *   segment → analyze every chunk (parallel, limited) → consolidate (if the outline is too big) → plan
 *
 * Each step is a separate short request to a stateless server endpoint, so no request approaches the
 * serverless time limit, a failed chunk is retried on its own, and the finished chunks are kept in the
 * `JobStore` (in memory, for as long as the page stays open) so a later attempt resumes where it stopped.
 */

export interface JobStore {
  /** Finished chunk analyses, by chunk content hash. */
  digests: Map<string, ChunkDigest>;
  /** Finished consolidation batches, by input hash. */
  consolidated: Map<string, ChunkDigest>;
  /** Finished plan parts, by request hash. */
  plans: Map<string, { plan: AiPlan; warnings: string[] }>;
}

export const createJobStore = (): JobStore => ({ digests: new Map(), consolidated: new Map(), plans: new Map() });

/** Split sections into `parts` consecutive groups of about equal size (by characters). */
export function partitionSections(sections: Pick<Section, "id" | "chars">[], parts: number): string[][] {
  const total = sections.reduce((n, s) => n + s.chars, 0);
  const groups: string[][] = [];
  let current: string[] = [];
  let acc = 0;
  for (const s of sections) {
    const target = (total * (groups.length + 1)) / parts;
    if (current.length && acc + s.chars / 2 > target && groups.length < parts - 1) {
      groups.push(current);
      current = [];
    }
    current.push(s.id);
    acc += s.chars;
  }
  if (current.length) groups.push(current);
  return groups;
}

/** Join the plans of consecutive parts into one deck plan. Later parts never contribute another title slide. */
export function mergePlans(parts: AiPlan[]): AiPlan {
  const [first] = parts;
  const slides = parts.flatMap((p, i) => (i === 0 ? p.slides : p.slides.filter((s) => s.layout.trim().toLowerCase() !== "title")));
  return {
    ...first,
    slides: slides.map((s, i) => ({ ...s, id: `slide-${String(i + 1).padStart(3, "0")}` })),
  };
}

export interface JobStats {
  mode: "single" | "chunked";
  chunks: number;
  chunksFromCache: number;
  /** HTTP requests sent to the step endpoints (including retries). */
  requests: number;
  retries: number;
  consolidationPasses: number;
  consolidationRequests: number;
  droppedPoints: number;
  documentChars: number;
}

export interface JobOptions {
  density: Density;
  preferDiagrams: boolean;
  fileName?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  store: JobStore;
  onProgress: (stage: Stage, detail?: string) => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

const STEP_TIMEOUT_MS = 130_000;
const MAX_WAIT_MS = 90_000;
const NEVER_RETRY = new Set(["quota-exhausted", "invalid-api-key", "missing-api-key", "ai-blocked", "bad-request", "payload-too-large", "empty-document", "job-incomplete"]);

/** Stable short hash (FNV-1a) used as a cache key. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}-${text.length}`;
}

export function isRetryable(error: unknown): boolean {
  if (!(error instanceof AppError)) return false;
  if (NEVER_RETRY.has(error.code)) return false;
  if (error.retryable !== undefined) return error.retryable;
  return ["rate-limited", "timeout", "network", "too-many-requests", "invalid-ai-response"].includes(error.code);
}

export async function analyzeDocumentJob(doc: ParsedDocument, o: JobOptions): Promise<AiPlanResult & { stats: JobStats }> {
  const sleep = o.sleep ?? realSleep;
  const random = o.random ?? Math.random;
  const base = o.baseUrl ?? "";
  const doFetch = o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const stats: JobStats = { mode: "chunked", chunks: 0, chunksFromCache: 0, requests: 0, retries: 0, consolidationPasses: 0, consolidationRequests: 0, droppedPoints: 0, documentChars: 0 };
  const retry = { max: 3 }; // replaced by the server-advertised value once the limits are known
  let concurrency = 1;

  /** One HTTP request to a step endpoint. Maps failures to AppError with retry advice. */
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    stats.requests++;
    const timeout = AbortSignal.timeout(STEP_TIMEOUT_MS);
    const signal = o.signal ? AbortSignal.any([o.signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await doFetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    } catch (error) {
      if (o.signal?.aborted) throw error;
      throw Object.assign(aiError(timeout.aborted ? "timeout" : "network", error), { retryable: true });
    }
    if (!res.ok) {
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        /* not JSON */
      }
      const error = fromBody(json as ErrorBody | null, "ai-unavailable");
      const header = Number(res.headers.get("retry-after"));
      if (error.retryAfterMs === undefined && Number.isFinite(header) && header > 0) error.retryAfterMs = header * 1000;
      throw error;
    }
    return (await res.json()) as T;
  };

  /** Retry temporary failures with exponential backoff, jitter and Retry-After; never retry permanent ones. */
  const withRetries = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const e = error as AppError;
        const cap = e.code === "invalid-ai-response" ? Math.min(1, retry.max) : retry.max;
        if (o.signal?.aborted || !isRetryable(error) || attempt >= cap) throw error;
        if (e.code === "rate-limited" || e.code === "ai-unavailable" || e.code === "too-many-requests") concurrency = 1; // back off the whole job
        const advised = e.retryAfterMs;
        if (advised !== undefined && advised > MAX_WAIT_MS) throw error;
        stats.retries++;
        await sleep(advised !== undefined ? advised * (1 + random() * 0.2) : backoffDelay(attempt, 2_000, 30_000, random), o.signal);
      }
    }
  };

  // ---- Stage A: segment -------------------------------------------------------------------------------------
  o.onProgress("segmenting");
  const limits = await withRetries(async () => {
    const r = await doFetch(`${base}/api/analyze/limits`, { signal: o.signal });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      throw Object.assign(fromBody(body as ErrorBody | null, "ai-unavailable"), { retryable: r.status >= 500 });
    }
    return (await r.json()) as Limits;
  }).catch((e) => {
    throw e instanceof AppError ? e : aiError("network", e);
  });
  concurrency = limits.concurrency;
  retry.max = limits.maxRetries;

  const wire = toWireDocument(doc);
  const sections = buildSections(wire.blocks, { maxChars: limits.chunkChars });
  const chars = totalChars(sections);
  stats.documentChars = chars;

  if (chars > limits.maxDocChars) {
    throw new AppError(
      "payload-too-large",
      `This document has about ${Math.round(chars / 1000).toLocaleString("en-US")},000 characters (roughly ${Math.round(chars / 3000)} pages), which is above the supported limit of ${Math.round(limits.maxDocChars / 1000).toLocaleString("en-US")},000 characters. Please split it into parts.`,
    );
  }

  // Short documents: a single request does everything.
  if (chars <= limits.singleCallChars) {
    stats.mode = "single";
    stats.chunks = 1;
    o.onProgress("analyzing", "whole document in one request");
    const result = await withRetries(() =>
      requestAiPlan(
        doc,
        { density: o.density, preferDiagrams: o.preferDiagrams, fileName: o.fileName, endpoint: `${base}/api/analyze`, signal: o.signal, fetchImpl: doFetch as typeof fetch },
        (s) => (s === "planning" ? o.onProgress("planning") : undefined),
      ),
    );
    stats.requests++;
    return { ...result, stats };
  }

  const chunks = chunkSections(sections, limits.chunkChars, limits.chunkOverlapChars);
  stats.chunks = chunks.length;
  if (chunks.length > limits.maxChunks) {
    throw new AppError("payload-too-large", `This document needs ${chunks.length} parts to analyze, more than the supported ${limits.maxChunks}. Please split it into parts.`);
  }

  // ---- Stage B/C: analyze each chunk ---------------------------------------------------------------------------
  const keyOf = (c: Chunk) => hash(chunkToText(c));
  const pending = chunks.filter((c) => !o.store.digests.has(keyOf(c)));
  stats.chunksFromCache = chunks.length - pending.length;
  let finished = stats.chunksFromCache;
  const progress = () => o.onProgress("analyzing", `${finished} of ${chunks.length} chunks`);
  progress();

  try {
    await runPool(
      pending,
      () => concurrency,
      async (chunk) => {
        const index = chunks.indexOf(chunk);
        const { digest } = await withRetries(() => post<{ digest: ChunkDigest }>("/api/analyze/chunk", { index, total: chunks.length, chunk: { id: chunk.id, parts: chunk.parts, context: chunk.context } }));
        o.store.digests.set(keyOf(chunk), digest);
        finished++;
        progress();
      },
    );
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    const left = chunks.length - finished;
    throw new AppError(error.code, `${error.message} ${finished} of ${chunks.length} parts of the document were analyzed and are kept; ${left} remain, and pressing Generate again continues from there.`, {
      cause: error,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
    });
  }
  let level: ChunkDigest[] = chunks.map((c) => o.store.digests.get(keyOf(c))!);

  // ---- Stage D: consolidate when the outline is too big for the planning request ----------------------------------------
  const refs: SectionRef[] = sections.map((s) => ({ id: s.id, heading: s.heading }));
  const tables = wire.blocks.flatMap((b) => (b.type === "table" ? [{ id: b.id, headers: b.headers, rows: b.rows.slice(0, 30) }] : []));
  const images = wire.blocks.flatMap((b: WireBlock) => (b.type === "image" ? [{ id: b.id, alt: b.alt }] : []));
  const overhead = formatDigests([], refs, tables, images).length;
  const budget = Math.max(8_000, limits.planInputChars - overhead);
  const warnings: string[] = [];
  const size = (d: ChunkDigest[]) => digestsText(d, refs).length;

  while (size(level) > budget && stats.consolidationPasses < 3) {
    const before = size(level);
    const batchChars = Math.max(10_000, Math.floor(limits.planInputChars / 2));
    const batches: ChunkDigest[][] = [];
    let cur: ChunkDigest[] = [];
    let curSize = 0;
    for (const d of level) {
      const n = size([d]);
      if (cur.length && curSize + n > batchChars) {
        batches.push(cur);
        cur = [];
        curSize = 0;
      }
      cur.push(d);
      curSize += n;
    }
    if (cur.length) batches.push(cur);

    stats.consolidationPasses++;
    let doneBatches = 0;
    const label = () => o.onProgress("consolidating", `pass ${stats.consolidationPasses}: ${doneBatches} of ${batches.length} batches`);
    label();
    const target = Math.max(2_000, Math.floor(before / batches.length / 2));
    level = await runPool(
      batches,
      () => concurrency,
      async (batch) => {
        const key = hash(`${target}|${digestsText(batch, refs)}`);
        let out = o.store.consolidated.get(key);
        if (!out) {
          stats.consolidationRequests++;
          out = (await withRetries(() => post<{ digest: ChunkDigest }>("/api/analyze/consolidate", { digests: batch, sections: refs, targetChars: target }))).digest;
          o.store.consolidated.set(key, out);
        }
        doneBatches++;
        label();
        return out;
      },
    );
    if (size(level) > before * 0.9) break; // not shrinking enough; stop spending requests
  }
  if (stats.consolidationPasses > 0) warnings.push("The document was long, so the analyses of its sections were condensed before planning. Check that nothing important is missing.");
  if (size(level) > budget) {
    const fitted = dropToFit(level, budget);
    level = fitted.digests;
    stats.droppedPoints = fitted.dropped;
    if (!fitted.fits && size(level) > limits.planInputChars * 1.4) {
      throw new AppError("payload-too-large", "Even after condensing, this document's outline is too large to plan in one pass. Please split the document into parts.");
    }
    if (fitted.dropped) warnings.push(`To stay within the AI's input limit, ${fitted.dropped} low-priority detail point(s) were left out of the outline.`);
  }

  // ---- Stage E: the final slide plan ------------------------------------------------------------------------------------
  // One answer cannot hold hundreds of slides, so long documents are planned in consecutive parts.
  const expected = slideRange(chars, o.density).max;
  const partCount = Math.max(1, Math.ceil(expected / SLIDES_PER_PLAN_REQUEST));
  const groups = partitionSections(sections, partCount);
  const results: { plan: AiPlan; warnings: string[] }[] = [];
  let plannedParts = 0;
  const planLabel = () => o.onProgress("planning", groups.length > 1 ? `${plannedParts} of ${groups.length} parts` : undefined);
  planLabel();

  const partResults = await runPool(
    groups,
    () => concurrency,
    async (ids, index) => {
      const idSet = new Set(ids);
      const partSections = sections.filter((s) => idSet.has(s.id));
      const blockIds = new Set(partSections.flatMap((s) => s.blockIds));
      const entries = level.map((d) => ({ sections: d.sections.filter((e) => idSet.has(e.sectionId)) })).filter((d) => d.sections.length);
      const body = {
        title: wire.title,
        fileName: o.fileName,
        density: o.density,
        preferDiagrams: o.preferDiagrams,
        totalChars: partSections.reduce((n, s) => n + s.chars, 0),
        sections: partSections.map((s) => ({ id: s.id, heading: s.heading })),
        part: groups.length > 1 ? { index, total: groups.length } : undefined,
        digests: entries.length ? entries : level.slice(0, 1),
        tables: tables.filter((t) => blockIds.has(t.id)),
        images: images.filter((i) => blockIds.has(i.id)),
        numbers: Array.from(new Set(partSections.flatMap((s) => extractNumbers(s.text)))).slice(0, 100_000),
      };
      const key = hash(JSON.stringify(body));
      let done = o.store.plans.get(key);
      if (!done) {
        const planned = await withRetries(() => post<{ plan: unknown; warnings: string[] }>("/api/analyze/plan", body));
        const parsed = planSchema.safeParse(planned.plan);
        if (!parsed.success) throw Object.assign(aiError("invalid-ai-response"), { retryable: false });
        done = { plan: parsed.data, warnings: planned.warnings ?? [] };
        o.store.plans.set(key, done);
      }
      plannedParts++;
      planLabel();
      return done;
    },
  );
  results.push(...partResults);
  const merged = mergePlans(results.map((r) => r.plan));
  const parsed = { data: merged };
  const planned = { warnings: results.flatMap((r) => r.warnings), meta: { model: limits.model } };
  return { plan: parsed.data, warnings: [...warnings, ...planned.warnings], model: planned.meta.model, stats };
}
