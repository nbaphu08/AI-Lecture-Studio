import { readConfig, type AiConfig } from "@/lib/ai/config";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { handleAnalyze } from "@/lib/ai/route-handler";
import { handleChunk, handleConsolidate, handleLimits, handlePlan } from "@/lib/ai/step-handlers";
import type { JsonGenerator } from "@/lib/ai/gemini-client";

/**
 * Routes the browser job runner's fetch straight into the real server handlers (no network), with the
 * Gemini generator replaced by a deterministic fake. Records every HTTP request.
 */
export function makeServer(generator: JsonGenerator | null, over: Partial<AiConfig> = {}) {
  const config: AiConfig = { ...readConfig({ GEMINI_API_KEY: "test-key" }), maxRetries: 3, ...over };
  const seenConfigs: AiConfig[] = [];
  const deps = {
    config,
    limiter: createRateLimiter(100_000, 60_000),
    state: { inFlight: 0 },
    // generator = null simulates a server without an API key (no generator can be created).
    makeGenerator: generator ? (c: AiConfig) => (seenConfigs.push(c), generator) : undefined,
  };
  const log: { path: string; status: number; at: number }[] = [];
  const t0 = Date.now();
  const inFlight = { now: 0, peak: 0 };

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const path = new URL(String(input), "http://localhost").pathname;
    inFlight.now++;
    inFlight.peak = Math.max(inFlight.peak, inFlight.now);
    try {
      const req = new Request(`http://localhost${path}`, init);
      let res: Response;
      if (path === "/api/analyze/limits") res = handleLimits(deps);
      else if (path === "/api/analyze/chunk") res = await handleChunk(req, deps);
      else if (path === "/api/analyze/consolidate") res = await handleConsolidate(req, deps);
      else if (path === "/api/analyze/plan") res = await handlePlan(req, deps);
      else if (path === "/api/analyze") res = await handleAnalyze(req, deps);
      else res = new Response("not found", { status: 404 });
      log.push({ path, status: res.status, at: Date.now() - t0 });
      return res;
    } finally {
      inFlight.now--;
    }
  };
  const count = (path: string) => log.filter((l) => l.path === path).length;
  return { config, deps, fetchImpl, log, count, inFlight, seenConfigs };
}

/** Wrap a fetch so that scripted responses are returned instead of calling through for some requests. */
export function withFaults(
  inner: ReturnType<typeof makeServer>["fetchImpl"],
  fault: (path: string, n: number, body: string) => Response | undefined | Promise<Response | undefined>,
) {
  const counts = new Map<string, number>();
  return async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const n = (counts.get(path) ?? 0) + 1;
    counts.set(path, n);
    const f = await fault(path, n, typeof init?.body === "string" ? init.body : "");
    return f ?? inner(input, init);
  };
}

export const errorResponse = (status: number, code: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  Response.json({ error: { code, message: `fake ${code}`, ...extra } }, { status, headers });
