import { planSchema, type AiPlan } from "@/lib/ai/schemas";
import type { ErrorBody, StreamEvent } from "@/lib/ai/protocol";
import type { AnalyzeStage } from "@/lib/ai/analyze-service";
import { toWireDocument } from "@/lib/document/wire";
import type { ParsedDocument } from "@/lib/docx/types";
import type { Density } from "@/lib/slides/types";
import { AppError, aiError, type ErrorCode } from "@/lib/utils/errors";

/** Browser side of POST /api/analyze. The browser never talks to Google; the API key stays on the server. */

export interface AiPlanResult {
  plan: AiPlan;
  warnings: string[];
  model: string;
}

export interface AnalyzeOptions {
  density: Density;
  preferDiagrams: boolean;
  fileName?: string;
  endpoint?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const CLIENT_TIMEOUT_MS = 295_000;

function fromBody(body: unknown, fallback: ErrorCode): AppError {
  const e = (body as Partial<ErrorBody> | null)?.error;
  if (e && typeof e.message === "string" && typeof e.code === "string") return new AppError(e.code as ErrorCode, e.message);
  return aiError(fallback);
}

export async function requestAiPlan(doc: ParsedDocument, options: AnalyzeOptions, onStage: (s: AnalyzeStage) => void): Promise<AiPlanResult> {
  const { endpoint = "/api/analyze", fetchImpl = fetch } = options;
  const wire = toWireDocument(doc);
  const timeout = AbortSignal.timeout(CLIENT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: wire.title,
        fileName: options.fileName,
        density: options.density,
        preferDiagrams: options.preferDiagrams,
        blocks: wire.blocks,
      }),
      signal,
    });
  } catch (error) {
    throw aiError(timeout.aborted ? "timeout" : "network", error);
  }

  if (!res.ok || !res.body) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    throw fromBody(body, res.status === 404 || res.status === 405 ? "ai-unavailable" : "ai-unavailable");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AiPlanResult | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch {
      throw aiError("invalid-ai-response");
    }
    if (event.type === "stage") onStage(event.stage);
    else if (event.type === "error") throw new AppError(event.code, event.message);
    else if (event.type === "result") {
      // Defense in depth: the browser re-validates what the server already validated.
      const parsed = planSchema.safeParse(event.plan);
      if (!parsed.success) throw aiError("invalid-ai-response");
      result = { plan: parsed.data, warnings: event.warnings ?? [], model: event.meta?.model ?? "" };
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        handle(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    handle(buffer);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw aiError(timeout.aborted ? "timeout" : "network", error);
  }
  if (!result) throw aiError("network");
  return result;
}
