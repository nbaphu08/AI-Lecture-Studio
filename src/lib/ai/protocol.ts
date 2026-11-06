import type { ErrorCode } from "@/lib/utils/errors";
import type { AnalyzeStage } from "./analyze-service";

/** Messages of the NDJSON stream returned by POST /api/analyze (one JSON object per line). */
export type StreamEvent =
  | { type: "stage"; stage: AnalyzeStage }
  | { type: "result"; plan: unknown; warnings: string[]; meta: { model: string; mode: "single"; chunks: number; requests: number } }
  | { type: "error"; code: ErrorCode; message: string; retryable?: boolean; retryAfterMs?: number };

/** Errors found before streaming starts are returned as plain JSON with an HTTP error status. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string; retryable?: boolean; retryAfterMs?: number };
}

/** HTTP status used for each error code. */
export const HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  "missing-api-key": 503,
  "payload-too-large": 413,
  "bad-request": 400,
  "too-many-requests": 429,
  "rate-limited": 429,
  "quota-exhausted": 429,
  "empty-document": 422,
  "invalid-type": 415,
  "invalid-api-key": 502,
  "ai-unavailable": 503,
  "ai-blocked": 422,
  "invalid-ai-response": 502,
  timeout: 504,
  network: 502,
};

/** Largest request body accepted. Vercel functions reject bodies over 4.5 MB anyway. */
export const MAX_BODY_BYTES = 3_500_000;
