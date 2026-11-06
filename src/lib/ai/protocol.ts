import type { ErrorCode } from "@/lib/utils/errors";
import type { AnalyzeStage } from "./analyze-service";

/** Messages of the NDJSON stream returned by POST /api/analyze (one JSON object per line). */
export type StreamEvent =
  | { type: "stage"; stage: AnalyzeStage }
  | { type: "result"; plan: unknown; warnings: string[]; meta: { model: string; mode: "single" | "chunked"; chunks: number; requests: number } }
  | { type: "error"; code: ErrorCode; message: string };

/** Errors found before streaming starts are returned as plain JSON with an HTTP error status. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

/** Largest request body accepted. Vercel functions reject bodies over 4.5 MB anyway. */
export const MAX_BODY_BYTES = 3_500_000;
