/**
 * Server-side configuration read from environment variables. Everything is tunable without code changes.
 * Never import this from client components: it reads secrets.
 */

export interface AiConfig {
  apiKey: string | undefined;
  /** Gemini model id. Must be a model your key can use on the free tier. */
  model: string;
  /** Total characters of document text accepted for one analysis. */
  maxDocChars: number;
  /** Documents up to this many characters are analyzed and planned in a single request. */
  singleCallChars: number;
  /** Target size of one chunk when a document needs several requests. */
  chunkChars: number;
  /** Upper bound for tokens in one answer (includes thinking tokens). Must not exceed the model's output limit. */
  maxOutputTokens: number;
  /** Secret that enables /api/diagnostics in production. Unset = the endpoint is disabled there. */
  diagnosticsToken: string | undefined;
  /** Simultaneous Gemini requests. Keep at 1 on the free tier. */
  concurrency: number;
  /** Retries after a temporary failure (rate limit, 5xx, network). */
  maxRetries: number;
  /** Timeout of a single Gemini request. */
  requestTimeoutMs: number;
  /** Overall deadline for one analysis (must stay below the route's maxDuration). */
  totalTimeoutMs: number;
  /** Best-effort per-IP limit: requests per window. */
  rateLimitMax: number;
  rateLimitWindowMs: number;
  /** Best-effort cap on analyses running at once in this server instance. */
  maxInFlight: number;
}

/**
 * Default model. Listed as a Flash model with a "Free of charge" Free Tier on Google's models and
 * pricing pages (checked 2026-11-06). Google changes this from time to time and quotas are per project,
 * so always confirm with `npm run check:gemini` and set GEMINI_MODEL if your key needs another model.
 */
export const DEFAULT_MODEL = "gemini-3.8-flash";

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function readConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const chunkChars = int(env.AI_CHUNK_CHARS, 24_000, 4_000, 200_000);
  return {
    // GEMINI_API_KEY is preferred; GOOGLE_API_KEY (the name the Google SDK itself uses) also works.
    apiKey: env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim() || undefined,
    model: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    maxDocChars: int(env.AI_MAX_DOC_CHARS, 300_000, 5_000, 2_000_000),
    singleCallChars: int(env.AI_SINGLE_CALL_CHARS, 45_000, 4_000, 400_000),
    chunkChars,
    maxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 32_768, 1_024, 65_536),
    diagnosticsToken: env.DIAGNOSTICS_TOKEN?.trim() || undefined,
    concurrency: int(env.AI_CONCURRENCY, 1, 1, 4),
    maxRetries: int(env.AI_MAX_RETRIES, 3, 0, 6),
    requestTimeoutMs: int(env.AI_REQUEST_TIMEOUT_MS, 90_000, 5_000, 280_000),
    totalTimeoutMs: int(env.AI_TOTAL_TIMEOUT_MS, 270_000, 10_000, 290_000),
    rateLimitMax: int(env.RATE_LIMIT_MAX, 8, 1, 1000),
    rateLimitWindowMs: int(env.RATE_LIMIT_WINDOW_MS, 10 * 60_000, 1_000, 24 * 3_600_000),
    maxInFlight: int(env.MAX_IN_FLIGHT, 3, 1, 50),
  };
}
