import * as z from "zod";
import { AppError, type ErrorCode } from "@/lib/utils/errors";
import { analyzeChunk } from "./document-analyzer";
import type { AiConfig } from "./config";
import { classifyError, createClient, createGeminiGenerator, describeError, type GenAiLike, type JsonGenerator } from "./gemini-client";
import { validationContext, planWithAi } from "./slide-planner";
import { buildSections, totalChars } from "@/lib/document/sections";
import { chunkSections } from "@/lib/document/chunker";
import type { WireBlock } from "@/lib/document/wire";

/**
 * Connectivity and model diagnostics. It reports facts about the API (reachable? model exists? does
 * structured output work?) without ever returning the API key, raw Google error text, or any user
 * document: the built-in sample below is the only content ever sent.
 */

export type DiagnosticMode = "models" | "generate" | "full";
export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

export interface DiagnosticCheck {
  id: "config" | "model" | "structured-output" | "plan-schema" | "digest-schema";
  title: string;
  status: CheckStatus;
  /** Secret-free description. */
  detail: string;
  code?: ErrorCode;
}

export interface DiagnosticReport {
  ok: boolean;
  mode: DiagnosticMode;
  model: string;
  /** True only if Gemini actually returned an answer during this run. */
  receivedGeminiResponse: boolean;
  /** Number of generateContent requests made (these use free-tier quota). */
  generateRequests: number;
  checks: DiagnosticCheck[];
}

const SAMPLE: WireBlock[] = [
  { id: "b0", type: "title", text: "Water Cycle Basics" },
  { id: "b1", type: "heading", level: 1, text: "Evaporation" },
  { id: "b2", type: "paragraph", text: "Heat from the sun turns liquid water into vapour. About 90 percent of atmospheric moisture comes from the oceans." },
  { id: "b3", type: "heading", level: 1, text: "Condensation" },
  { id: "b4", type: "paragraph", text: "Water vapour cools and forms clouds. Precipitation then returns water to the surface." },
];

const ECHO = z.object({ ok: z.boolean(), word: z.string() });
const ECHO_JSON = {
  type: "object",
  properties: { ok: { type: "boolean" }, word: { type: "string" } },
  required: ["ok", "word"],
};

/** Remove anything that looks like an API key, and the configured key itself, from a string. */
export function redact(text: string, key?: string): string {
  let out = text.replace(/AIza[0-9A-Za-z_-]{16,}/g, "[redacted]");
  if (key && key.length >= 8) out = out.split(key).join("[redacted]");
  return out;
}

export interface DiagnosticDeps {
  sdk?: GenAiLike;
  generator?: JsonGenerator;
}

export async function runDiagnostics(config: AiConfig, mode: DiagnosticMode = "models", deps: DiagnosticDeps = {}): Promise<DiagnosticReport> {
  const checks: DiagnosticCheck[] = [];
  let received = false;
  let generateRequests = 0;
  const add = (c: DiagnosticCheck) => (checks.push({ ...c, detail: redact(c.detail, config.apiKey) }), c);
  const fail = (id: DiagnosticCheck["id"], title: string, error: unknown): DiagnosticCheck => {
    const code = error instanceof AppError ? error.code : classifyError(error).error.code;
    return add({ id, title, status: "fail", detail: describeError(error), code });
  };
  const skip = (id: DiagnosticCheck["id"], title: string, why: string) => add({ id, title, status: "skipped", detail: why });
  const report = (): DiagnosticReport => ({
    ok: checks.every((c) => c.status === "pass" || c.status === "warn" || c.status === "skipped") && checks.some((c) => c.status === "pass"),
    mode,
    model: config.model,
    receivedGeminiResponse: received,
    generateRequests,
    checks,
  });

  // 1. Configuration: only booleans, never the key.
  if (!config.apiKey && !deps.sdk) {
    add({ id: "config", title: "API key and model configured", status: "fail", detail: "GEMINI_API_KEY is not set on the server.", code: "missing-api-key" });
    for (const [id, title] of [["model", "Model is available to this key"], ["structured-output", "Structured JSON output works"], ["plan-schema", "Slide-plan schema is accepted"], ["digest-schema", "Chunk-analysis schema is accepted"]] as const) {
      skip(id, title, "Needs an API key.");
    }
    return report();
  }
  add({ id: "config", title: "API key and model configured", status: "pass", detail: `API key present (value hidden); model "${config.model}".` });

  let client: GenAiLike;
  try {
    client = deps.sdk ?? createClient(config);
  } catch (error) {
    fail("config", "SDK client created", error);
    return report();
  }

  // 2. Model lookup: free of generation cost.
  try {
    const m = await client.models.get({ model: config.model });
    const actions = m.supportedActions ?? [];
    const canGenerate = actions.length === 0 || actions.includes("generateContent");
    const notes = [
      m.displayName ? `"${m.displayName}"` : undefined,
      m.inputTokenLimit ? `input limit ${m.inputTokenLimit}` : undefined,
      m.outputTokenLimit ? `output limit ${m.outputTokenLimit}` : undefined,
      `actions: ${actions.length ? actions.join(", ") : "not reported"}`,
    ].filter(Boolean);
    if (!canGenerate) {
      add({ id: "model", title: "Model is available to this key", status: "fail", detail: `Model found but it does not support generateContent. ${notes.join("; ")}`, code: "ai-unavailable" });
    } else if (m.outputTokenLimit && config.maxOutputTokens > m.outputTokenLimit) {
      add({ id: "model", title: "Model is available to this key", status: "warn", detail: `Model found, but AI_MAX_OUTPUT_TOKENS (${config.maxOutputTokens}) exceeds its output limit (${m.outputTokenLimit}). ${notes.join("; ")}` });
    } else {
      add({ id: "model", title: "Model is available to this key", status: "pass", detail: notes.join("; ") });
    }
  } catch (error) {
    fail("model", "Model is available to this key", error);
    // A failed key/model lookup makes generation checks pointless and would only burn quota.
    for (const [id, title] of [["structured-output", "Structured JSON output works"], ["plan-schema", "Slide-plan schema is accepted"], ["digest-schema", "Chunk-analysis schema is accepted"]] as const) {
      skip(id, title, "Skipped because the model lookup failed.");
    }
    return report();
  }

  if (mode === "models") {
    for (const [id, title] of [["structured-output", "Structured JSON output works"], ["plan-schema", "Slide-plan schema is accepted"], ["digest-schema", "Chunk-analysis schema is accepted"]] as const) {
      skip(id, title, "Not run in this mode (it uses free-tier quota).");
    }
    return report();
  }

  const base = deps.generator ?? createGeminiGenerator({ ...config, maxRetries: Math.min(config.maxRetries, 1) }, client);
  const generate: JsonGenerator = async (r, s) => {
    generateRequests++;
    const text = await base(r, s);
    received = true; // an actual answer arrived from the model
    return text;
  };

  // 3. Minimal structured-output round trip with the same request settings the app uses.
  try {
    const text = await generate({ system: "Return only JSON.", prompt: 'Return {"ok": true, "word": "ready"}.', jsonSchema: ECHO_JSON, maxOutputTokens: 256 });
    const parsed = ECHO.safeParse(JSON.parse(text));
    if (parsed.success && parsed.data.ok) add({ id: "structured-output", title: "Structured JSON output works", status: "pass", detail: "The model answered with JSON matching the requested schema." });
    else add({ id: "structured-output", title: "Structured JSON output works", status: "fail", detail: "The model answered, but not with the requested JSON shape.", code: "invalid-ai-response" });
  } catch (error) {
    fail("structured-output", "Structured JSON output works", error);
    for (const [id, title] of [["plan-schema", "Slide-plan schema is accepted"], ["digest-schema", "Chunk-analysis schema is accepted"]] as const) skip(id, title, "Skipped because the basic request failed.");
    return report();
  }

  if (mode !== "full") {
    for (const [id, title] of [["plan-schema", "Slide-plan schema is accepted"], ["digest-schema", "Chunk-analysis schema is accepted"]] as const) skip(id, title, "Run with mode=full to test the real schemas.");
    return report();
  }

  // 4. The application's real schemas and prompts, on the built-in sample only.
  const sections = buildSections(SAMPLE);
  const ctx = validationContext(SAMPLE, sections.map((s) => s.text).join("\n"), sections);
  try {
    const source = sections.map((s) => `=== ${s.id}${s.heading ? ` — "${s.heading}"` : ""} ===\n${s.text}`).join("\n\n");
    const { plan, warnings } = await planWithAi(generate, { source, sourceKind: "document", sections, chars: totalChars(sections), density: "concise", preferDiagrams: false, ctx });
    add({ id: "plan-schema", title: "Slide-plan schema is accepted", status: "pass", detail: `Valid plan with ${plan.slides.length} slides (${warnings.length} validation warnings).` });
  } catch (error) {
    fail("plan-schema", "Slide-plan schema is accepted", error);
  }
  try {
    const chunk = chunkSections(sections, 10_000)[0];
    const digest = await analyzeChunk(generate, chunk, 0, 1);
    add({ id: "digest-schema", title: "Chunk-analysis schema is accepted", status: "pass", detail: `Valid analysis of ${digest.sections.length} sections.` });
  } catch (error) {
    fail("digest-schema", "Chunk-analysis schema is accepted", error);
  }
  return report();
}
