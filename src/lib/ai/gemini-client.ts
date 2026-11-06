import { ApiError, GoogleGenAI } from "@google/genai";
import { AppError, aiError } from "@/lib/utils/errors";
import type { AiConfig } from "./config";

/**
 * Thin wrapper around the official @google/genai SDK. The rest of the application only sees
 * `JsonGenerator`, so the model (or even the provider) can change without touching other modules.
 * This file runs on the server only: it reads the API key.
 */

export interface JsonRequest {
  system: string;
  prompt: string;
  /** JSON schema describing the response (Gemini structured output). */
  jsonSchema: object;
  /** Capped by AI_MAX_OUTPUT_TOKENS. */
  maxOutputTokens?: number;
}

/** Returns the model's raw JSON text. Throws AppError with a user-safe message. */
export type JsonGenerator = (request: JsonRequest, signal?: AbortSignal) => Promise<string>;

// ---- Error classification ----------------------------------------------------------------------------

export interface Classified {
  error: AppError;
  retryable: boolean;
  /** Delay suggested by the service, in ms. */
  retryAfterMs?: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

function parseRetryDelay(message: string): number | undefined {
  const m = /retry(?:\s+in|Delay"?\s*[:=]\s*"?)\s*([\d.]+)\s*s/i.exec(message);
  return m ? Math.round(Number(m[1]) * 1000) : undefined;
}

/**
 * The SDK's ApiError message is the JSON body of Google's error response:
 * {"error":{"code":429,"message":"...","status":"RESOURCE_EXHAUSTED","details":[...]}}.
 * Only these short machine fields are ever surfaced, never the free-text message.
 */
export interface GoogleErrorFacts {
  httpStatus?: number;
  /** e.g. RESOURCE_EXHAUSTED, NOT_FOUND, INVALID_ARGUMENT, PERMISSION_DENIED */
  status?: string;
  /** e.g. API_KEY_INVALID */
  reason?: string;
  /** e.g. GenerateRequestsPerDayPerProjectPerModel-FreeTier */
  quotaId?: string;
}

export function googleErrorFacts(error: unknown): GoogleErrorFacts {
  const facts: GoogleErrorFacts = {};
  const status = error instanceof ApiError ? error.status : (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") facts.httpStatus = status;
  const message = messageOf(error);
  facts.status = /"status"\s*:\s*"([A-Z_]+)"/.exec(message)?.[1];
  facts.reason = /"reason"\s*:\s*"([A-Z_]+)"/.exec(message)?.[1] ?? (/API key (?:not valid|expired)/i.test(message) ? "API_KEY_INVALID" : undefined);
  facts.quotaId = /"quotaId"\s*:\s*"([\w.-]+)"/.exec(message)?.[1] ?? /\b(Generate\w*Requests?\w*PerDay\w*|Generate\w*PerMinute\w*|\w+-FreeTier)\b/.exec(message)?.[1];
  return facts;
}

/** A short, secret-free description such as "HTTP 429 RESOURCE_EXHAUSTED (…PerDay…-FreeTier)". */
export function describeError(error: unknown): string {
  if (error instanceof AppError && !(error.cause)) return error.code;
  const cause = error instanceof AppError ? error.cause : error;
  const f = googleErrorFacts(cause);
  const parts = [f.httpStatus ? `HTTP ${f.httpStatus}` : undefined, f.status, f.reason, f.quotaId ? `(${f.quotaId})` : undefined].filter(Boolean);
  if (parts.length) return parts.join(" ");
  const name = cause instanceof Error ? cause.name : "";
  return name === "AbortError" || name === "TimeoutError" ? "request aborted or timed out" : error instanceof AppError ? error.code : "unknown error";
}

/** Map anything thrown by the SDK / fetch / abort signals to a user-safe error and a retry decision. */
export function classifyError(error: unknown): Classified {
  if (error instanceof AppError) return { error, retryable: false };

  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError") return { error: aiError("timeout", error), retryable: false };

  const message = messageOf(error);
  const f = googleErrorFacts(error);
  const http = f.httpStatus;

  if (typeof http === "number") {
    if (http === 429 || f.status === "RESOURCE_EXHAUSTED") {
      if (/PerDay|per day|daily|limit:\s*0\b/i.test(`${message} ${f.quotaId ?? ""}`)) return { error: aiError("quota-exhausted", error), retryable: false };
      const retryAfterMs = parseRetryDelay(message);
      const perMinute = /PerMinute|per minute|retryDelay|retry in/i.test(message);
      return { error: aiError(/quota/i.test(message) && !perMinute ? "quota-exhausted" : "rate-limited", error), retryable: true, retryAfterMs };
    }
    if (http === 401 || http === 403 || f.reason === "API_KEY_INVALID" || f.status === "UNAUTHENTICATED" || f.status === "PERMISSION_DENIED") {
      return { error: aiError("invalid-api-key", error), retryable: false };
    }
    if (http === 404 || f.status === "NOT_FOUND") {
      return {
        error: aiError("ai-unavailable", error, "The configured AI model is not available for this API key. Ask the site owner to check the GEMINI_MODEL setting."),
        retryable: false,
      };
    }
    if (http === 408 || http === 504 || f.status === "DEADLINE_EXCEEDED") return { error: aiError("timeout", error), retryable: true };
    if (http >= 500) return { error: aiError("ai-unavailable", error), retryable: true, retryAfterMs: parseRetryDelay(message) };
    if (http === 400 || f.status === "INVALID_ARGUMENT") {
      return {
        error: aiError("ai-unavailable", error, "The AI service rejected the request. This is a server configuration problem. Ask the site owner to check the model and schema settings."),
        retryable: false,
      };
    }
    return { error: aiError("ai-unavailable", error), retryable: false };
  }

  if (/fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|socket/i.test(message)) {
    return { error: aiError("network", error), retryable: true };
  }
  return { error: aiError("ai-unavailable", error), retryable: false };
}

// ---- Retry with exponential backoff ------------------------------------------------------------------

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
  /** Longest single wait. If the service asks for a longer one, we give up instead of waiting. */
  maxDelayMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Run `fn`, retrying temporary failures a limited number of times. Never retries forever. */
export async function withRetries<T>(fn: () => Promise<T>, options: RetryOptions, signal?: AbortSignal): Promise<T> {
  const { maxRetries, baseDelayMs = 2_000, maxDelayMs = 30_000, sleep = sleepWithSignal, random = Math.random } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (raw) {
      const c = classifyError(raw);
      if (signal?.aborted) throw aiError("timeout", raw);
      const wait = c.retryAfterMs ?? baseDelayMs * 2 ** attempt * (0.75 + random() * 0.5);
      if (!c.retryable || attempt >= maxRetries || wait > maxDelayMs) {
        // Keep the retry advice so a caller (the browser job runner) can decide to try again later.
        c.error.retryable = c.retryable;
        c.error.retryAfterMs = c.retryAfterMs;
        throw c.error;
      }
      await sleep(wait, signal);
    }
  }
}

// ---- The Gemini-backed generator ---------------------------------------------------------------------

/** The slice of the SDK this module needs; lets tests substitute a fake. */
export interface GenAiLike {
  models: {
    get(params: { model: string }): Promise<{
      name?: string;
      displayName?: string;
      version?: string;
      inputTokenLimit?: number;
      outputTokenLimit?: number;
      supportedActions?: string[];
      thinking?: boolean;
    }>;
    generateContent(params: {
      model: string;
      contents: string;
      config: Record<string, unknown>;
    }): Promise<{
      text?: string;
      candidates?: { finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    }>;
  };
}

const BLOCKED_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "RECITATION"]);
/** Stopped because of the output limit (CONTINUATION = per-request limit reached, resumable). */
const TRUNCATED_REASONS = new Set(["MAX_TOKENS", "CONTINUATION"]);
const NORMAL_FINISH = new Set(["STOP", "FINISH_REASON_UNSPECIFIED"]);

/** The official SDK client. No SDK-level retries are configured, so retrying happens only in `withRetries`. */
export function createClient(config: AiConfig): GenAiLike {
  if (!config.apiKey) throw aiError("missing-api-key");
  return new GoogleGenAI({ apiKey: config.apiKey }) as unknown as GenAiLike;
}

export function createGeminiGenerator(config: AiConfig, sdk?: GenAiLike): JsonGenerator {
  const client: GenAiLike = sdk ?? createClient(config);

  return async (request, signal) => {
    const call = async () => {
      const timeout = AbortSignal.timeout(config.requestTimeoutMs);
      const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const response = await client.models.generateContent({
        model: config.model,
        contents: request.prompt,
        config: {
          systemInstruction: request.system,
          responseMimeType: "application/json",
          responseJsonSchema: request.jsonSchema,
          // `temperature` is deliberately not sent: Gemini 3.6 Flash and newer ignore it (and warn).
          maxOutputTokens: Math.min(request.maxOutputTokens ?? config.maxOutputTokens, config.maxOutputTokens),
          abortSignal,
        },
      });
      if (response.promptFeedback?.blockReason) throw aiError("ai-blocked");
      const finish = response.candidates?.[0]?.finishReason;
      if (finish && BLOCKED_REASONS.has(finish)) throw aiError("ai-blocked");
      const text = response.text?.trim();
      if (finish && TRUNCATED_REASONS.has(finish)) {
        throw aiError("invalid-ai-response", undefined, "The AI's answer was cut off because the document is very large. Try a shorter document or the concise setting.");
      }
      if (!text) throw aiError("invalid-ai-response", undefined, "The AI returned an empty answer. Please try again.");
      // Any other abnormal ending (OTHER, LANGUAGE, MALFORMED_RESPONSE, …) cannot be trusted.
      if (finish && !NORMAL_FINISH.has(finish)) throw aiError("invalid-ai-response");
      return text;
    };
    return withRetries(call, { maxRetries: config.maxRetries }, signal);
  };
}
