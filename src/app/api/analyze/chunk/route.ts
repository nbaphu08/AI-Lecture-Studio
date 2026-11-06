import { readConfig } from "@/lib/ai/config";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { handleChunk } from "@/lib/ai/step-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const first = readConfig();
const limiter = createRateLimiter(first.stepRateLimitMax, first.rateLimitWindowMs);
const state = { inFlight: 0 };

export function POST(req: Request): Promise<Response> {
  return handleChunk(req, { config: readConfig(), limiter, state });
}
