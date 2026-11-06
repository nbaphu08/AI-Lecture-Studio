import type * as z from "zod";
import { chunkToText } from "@/lib/document/chunker";
import { AppError, aiError, type ErrorCode } from "@/lib/utils/errors";
import { consolidateDigests, analyzeChunk } from "./document-analyzer";
import { formatDigests } from "./digest-utils";
import type { AiConfig } from "./config";
import { createGeminiGenerator, type JsonGenerator } from "./gemini-client";
import { HTTP_STATUS, MAX_BODY_BYTES, type ErrorBody } from "./protocol";
import type { RateLimiter } from "./rate-limit";
import { clientKey } from "./route-handler";
import { chunkRequestSchema, consolidateRequestSchema, planRequestSchema, type Limits } from "./step-schemas";
import { planWithAi } from "./slide-planner";
import type { ValidationContext } from "./plan-validation";

/**
 * Step endpoints for large documents. Every request is short and stateless; the browser keeps the
 * intermediate results, so a failed chunk can be retried on its own and nothing needs a database.
 * Gemini retries are NOT done here (maxRetries 0): the browser retries with backoff and Retry-After, so
 * a single serverless request never sits in a long retry loop.
 */

export interface StepDeps {
  config: AiConfig;
  limiter: RateLimiter;
  makeGenerator?: (config: AiConfig) => JsonGenerator;
  state: { inFlight: number };
}

const RETRYABLE_BY_DEFAULT: ErrorCode[] = ["rate-limited", "timeout", "network", "ai-unavailable", "invalid-ai-response"];

function fail(error: unknown): Response {
  const e = error instanceof AppError ? error : aiError("ai-unavailable");
  const retryable = e.retryable ?? (error instanceof AppError && RETRYABLE_BY_DEFAULT.includes(e.code) && e.code !== "ai-unavailable");
  const body: ErrorBody = { error: { code: e.code, message: e.message, retryable, retryAfterMs: e.retryAfterMs } };
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (e.retryAfterMs) headers["Retry-After"] = String(Math.max(1, Math.ceil(e.retryAfterMs / 1000)));
  if (!(error instanceof AppError)) console.error("[step] unexpected failure");
  else if (process.env.NODE_ENV !== "test") console.error("[step] failed:", e.code);
  return Response.json(body, { status: HTTP_STATUS[e.code] ?? 500, headers });
}

async function guarded<S extends z.ZodType>(
  req: Request,
  deps: StepDeps,
  schema: S,
  run: (data: z.output<S>, generate: JsonGenerator, signal: AbortSignal) => Promise<unknown>,
): Promise<Response> {
  const { config, limiter, state } = deps;
  if (!config.apiKey && !deps.makeGenerator) return fail(aiError("missing-api-key"));
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return fail(aiError("payload-too-large"));

  const limit = limiter.check(clientKey(req));
  if (!limit.ok) return fail(Object.assign(aiError("too-many-requests"), { retryable: true, retryAfterMs: limit.retryAfterSec * 1000 }));
  if (state.inFlight >= config.maxInFlight) return fail(Object.assign(aiError("rate-limited"), { retryable: true, retryAfterMs: 5_000 }));

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return fail(aiError("bad-request"));
  }
  if (raw.length > MAX_BODY_BYTES) return fail(aiError("payload-too-large"));
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(aiError("bad-request"));
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return fail(aiError("bad-request"));

  let generate: JsonGenerator;
  try {
    generate = (deps.makeGenerator ?? createGeminiGenerator)({ ...config, maxRetries: 0 });
  } catch (error) {
    return fail(error);
  }

  state.inFlight++;
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(config.totalTimeoutMs)]);
    const result = await run(parsed.data, generate, signal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(error);
  } finally {
    state.inFlight--;
  }
}

export function limitsOf(config: AiConfig): Limits {
  return {
    model: config.model,
    singleCallChars: config.singleCallChars,
    chunkChars: config.chunkChars,
    chunkOverlapChars: config.chunkOverlapChars,
    planInputChars: config.planInputChars,
    maxDocChars: config.maxDocChars,
    maxChunks: config.maxChunks,
    concurrency: config.concurrency,
    maxRetries: config.maxRetries,
  };
}

export function handleLimits(deps: Pick<StepDeps, "config">): Response {
  return Response.json(limitsOf(deps.config), { headers: { "Cache-Control": "no-store" } });
}

/** Stage B/C: analyze one chunk. */
export function handleChunk(req: Request, deps: StepDeps): Promise<Response> {
  return guarded(req, deps, chunkRequestSchema, async ({ chunk, index, total }, generate, signal) => {
    const text = chunkToText({ id: chunk.id, parts: chunk.parts, chars: 0, context: chunk.context });
    if (text.length > deps.config.chunkChars * 2 + deps.config.chunkOverlapChars + 2_000) throw aiError("payload-too-large");
    const digest = await analyzeChunk(generate, { id: chunk.id, parts: chunk.parts, chars: text.length, context: chunk.context }, index, total, signal);
    return { digest };
  });
}

/** Stage D: compress a batch of analyses. */
export function handleConsolidate(req: Request, deps: StepDeps): Promise<Response> {
  return guarded(req, deps, consolidateRequestSchema, async ({ digests, sections, targetChars }, generate, signal) => {
    const digest = await consolidateDigests(generate, digests, sections, targetChars, signal);
    return { digest };
  });
}

/** Stage E: the final slide plan from the (consolidated) analyses. The original text is never sent again. */
export function handlePlan(req: Request, deps: StepDeps): Promise<Response> {
  return guarded(req, deps, planRequestSchema, async (r, generate, signal) => {
    const source = formatDigests(r.digests, r.sections, r.tables, r.images);
    if (source.length > deps.config.planInputChars * 1.5) throw aiError("payload-too-large");
    const ctx: ValidationContext = {
      sectionIds: new Set(r.sections.map((s) => s.id)),
      tableIds: new Set(r.tables.map((t) => t.id)),
      imageIds: new Set(r.images.map((i) => i.id)),
      sourceText: "",
      numbers: new Set(r.numbers),
    };
    const { plan, warnings } = await planWithAi(
      generate,
      {
        source,
        sourceKind: "digests",
        sections: r.sections.map((s) => ({ id: s.id, heading: s.heading, level: 0, blockIds: [], text: "", chars: 0 })),
        chars: r.totalChars,
        density: r.density,
        preferDiagrams: !!r.preferDiagrams,
        documentTitle: r.title,
        fileName: r.fileName,
        part: r.part,
        ctx,
      },
      signal,
    );
    return { plan, warnings, meta: { model: deps.config.model } };
  });
}
