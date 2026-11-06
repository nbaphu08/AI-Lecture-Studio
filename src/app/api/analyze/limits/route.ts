import { readConfig } from "@/lib/ai/config";
import { handleLimits } from "@/lib/ai/step-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, non-secret limits so the browser can segment large documents the way the server expects. */
export function GET(): Response {
  return handleLimits({ config: readConfig() });
}
