import { AppError, aiError, type ErrorCode } from "@/lib/utils/errors";
import { analyzeRequestSchema } from "@/lib/document/wire";
import { analyzeDocument } from "./analyze-service";
import type { AiConfig } from "./config";
import { createGeminiGenerator, type JsonGenerator } from "./gemini-client";
import { HTTP_STATUS, MAX_BODY_BYTES, type ErrorBody, type StreamEvent } from "./protocol";
import type { RateLimiter } from "./rate-limit";

export interface Deps {
  config: AiConfig;
  limiter: RateLimiter;
  /** Defaults to the real Gemini client; tests pass a fake. */
  makeGenerator?: (config: AiConfig) => JsonGenerator;
  state: { inFlight: number };
}

export function errorResponse(code: ErrorCode, message: string, headers: Record<string, string> = {}): Response {
  const body: ErrorBody = { error: { code, message } };
  return Response.json(body, { status: HTTP_STATUS[code] ?? 500, headers: { "Cache-Control": "no-store", ...headers } });
}

export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

/** Convert anything thrown into a safe stream event. Details are never sent to the browser. */
export function toErrorEvent(error: unknown): StreamEvent {
  if (error instanceof AppError) return { type: "error", code: error.code, message: error.message, retryable: error.retryable, retryAfterMs: error.retryAfterMs };
  return { type: "error", code: "ai-unavailable", message: "Something went wrong while analyzing the document. Please try again." };
}

/**
 * POST /api/analyze. Checks the request, then streams progress and the final plan as NDJSON.
 * The Gemini API key is read here, on the server, and is never part of any response.
 */
export async function handleAnalyze(req: Request, deps: Deps): Promise<Response> {
  const { config, limiter, state } = deps;

  if (!config.apiKey && !deps.makeGenerator) return errorResponse("missing-api-key", aiError("missing-api-key").message);

  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return errorResponse("payload-too-large", aiError("payload-too-large").message);

  const limit = limiter.check(clientKey(req));
  if (!limit.ok) return errorResponse("too-many-requests", aiError("too-many-requests").message, { "Retry-After": String(limit.retryAfterSec) });
  if (state.inFlight >= config.maxInFlight) {
    return errorResponse("rate-limited", aiError("rate-limited").message, { "Retry-After": "30" });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return errorResponse("bad-request", aiError("bad-request").message);
  }
  if (raw.length > MAX_BODY_BYTES) return errorResponse("payload-too-large", aiError("payload-too-large").message);

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return errorResponse("bad-request", aiError("bad-request").message);
  }
  const parsed = analyzeRequestSchema.safeParse(json);
  if (!parsed.success) return errorResponse("bad-request", aiError("bad-request").message);

  let generate: JsonGenerator;
  try {
    generate = (deps.makeGenerator ?? createGeminiGenerator)(config);
  } catch (error) {
    const e = error instanceof AppError ? error : aiError("ai-unavailable");
    return errorResponse(e.code, e.message);
  }

  state.inFlight++;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          /* client went away */
        }
      };
      try {
        const result = await analyzeDocument(parsed.data, config, generate, (stage) => send({ type: "stage", stage }), req.signal);
        send({ type: "result", plan: result.plan, warnings: result.warnings, meta: result.meta });
      } catch (error) {
        // Only the error code is logged; document text and keys never are.
        if (process.env.NODE_ENV !== "test") console.error("[analyze] failed:", error instanceof AppError ? error.code : "unexpected");
        send(toErrorEvent(error));
      } finally {
        state.inFlight--;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
