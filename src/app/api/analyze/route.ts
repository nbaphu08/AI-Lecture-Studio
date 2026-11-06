import { readConfig } from "@/lib/ai/config";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { handleAnalyze } from "@/lib/ai/route-handler";

// Node.js runtime (Fluid Compute on Vercel): needs no Edge APIs and allows long-running requests.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const config = readConfig();
const limiter = createRateLimiter(config.rateLimitMax, config.rateLimitWindowMs);
const state = { inFlight: 0 };

export async function POST(req: Request): Promise<Response> {
  // Re-read the config per request so a changed environment variable is picked up on a warm instance too.
  return handleAnalyze(req, { config: { ...readConfig() }, limiter, state });
}

export function GET(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
