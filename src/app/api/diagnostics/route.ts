import { timingSafeEqual } from "node:crypto";
import { readConfig } from "@/lib/ai/config";
import { runDiagnostics, type DiagnosticMode } from "@/lib/ai/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODES: DiagnosticMode[] = ["models", "generate", "full"];

function authorized(req: Request, token: string | undefined): boolean {
  // Local development: open. Anywhere else: only with the secret DIAGNOSTICS_TOKEN.
  if (process.env.NODE_ENV === "development") return true;
  if (!token) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/diagnostics?mode=models|generate|full
 * Reports whether the Gemini API, key and model work. Never returns the key or document content.
 * Disabled (404) in production unless DIAGNOSTICS_TOKEN is set and sent as `Authorization: Bearer …`.
 */
export async function GET(req: Request): Promise<Response> {
  const config = readConfig();
  if (!authorized(req, config.diagnosticsToken)) return new Response("Not found", { status: 404 });
  const requested = new URL(req.url).searchParams.get("mode") as DiagnosticMode | null;
  const mode: DiagnosticMode = requested && MODES.includes(requested) ? requested : "models";
  const report = await runDiagnostics(config, mode);
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
