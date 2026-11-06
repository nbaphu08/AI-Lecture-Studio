export type ErrorCode =
  | "invalid-type"
  | "too-large"
  | "empty-file"
  | "corrupted"
  | "empty-document"
  | "parse-failed"
  | "plan-failed"
  | "generate-failed"
  // AI service
  | "missing-api-key"
  | "invalid-api-key"
  | "quota-exhausted"
  | "rate-limited"
  | "network"
  | "timeout"
  | "ai-unavailable"
  | "ai-blocked"
  | "invalid-ai-response"
  | "payload-too-large"
  | "bad-request"
  | "too-many-requests"
  | "validation-failed";

/** Messages that are safe to show to users for each AI-related failure. */
export const AI_ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  "missing-api-key": "The AI service is not configured on this server yet. Ask the site owner to add a Gemini API key.",
  "invalid-api-key": "The AI service rejected the server's API key. Ask the site owner to check the Gemini API key.",
  "quota-exhausted":
    "The AI service has reached its current usage limit (the free tier has daily and per-minute quotas). Please try again later.",
  "rate-limited": "The AI service is receiving too many requests right now. Please wait a minute and try again.",
  network: "The AI service could not be reached. Check your connection and try again.",
  timeout: "The AI service took too long to respond. Try again, or use a shorter document.",
  "ai-unavailable": "The AI service is temporarily unavailable. Please try again in a few minutes.",
  "ai-blocked": "The AI service declined to process this document. Try a different document.",
  "invalid-ai-response": "The AI returned a response that could not be turned into a reliable presentation. Please try again.",
  "payload-too-large": "This document is too long to analyze. Try a shorter document or split it into parts.",
  "bad-request": "The document could not be sent for analysis. Please reload the page and try again.",
  "too-many-requests": "You have made several requests in a short time. Please wait a few minutes and try again.",
};

/** An error whose message is safe to show to users as-is. */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options);
    this.name = "AppError";
    this.code = code;
  }
}

/** AppError with the standard user-facing message for an AI-service code. */
export function aiError(code: ErrorCode, cause?: unknown, message?: string): AppError {
  return new AppError(code, message ?? AI_ERROR_MESSAGES[code] ?? "The AI service failed.", { cause });
}

/** Failures after which the offline (non-AI) planner is a sensible alternative. */
export function isAiServiceFailure(error: unknown): boolean {
  if (!(error instanceof AppError)) return false;
  return [
    "missing-api-key",
    "invalid-api-key",
    "quota-exhausted",
    "rate-limited",
    "network",
    "timeout",
    "ai-unavailable",
    "ai-blocked",
    "invalid-ai-response",
    "too-many-requests",
    "payload-too-large",
  ].includes(error.code);
}

/** Convert anything thrown into a user-readable message, logging details in development. */
export function toUserMessage(error: unknown, fallback: string): string {
  if (process.env.NODE_ENV !== "production") {
    console.error("[AI Lecture Studio]", error);
  }
  return error instanceof AppError ? error.message : fallback;
}
