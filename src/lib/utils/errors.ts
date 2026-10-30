export type ErrorCode =
  | "invalid-type"
  | "too-large"
  | "empty-file"
  | "corrupted"
  | "empty-document"
  | "parse-failed"
  | "plan-failed"
  | "generate-failed";

/** An error whose message is safe to show to users as-is. */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options);
    this.name = "AppError";
    this.code = code;
  }
}

/** Convert anything thrown into a user-readable message, logging details in development. */
export function toUserMessage(error: unknown, fallback: string): string {
  if (process.env.NODE_ENV !== "production") {
    console.error("[SlideCraft]", error);
  }
  return error instanceof AppError ? error.message : fallback;
}
