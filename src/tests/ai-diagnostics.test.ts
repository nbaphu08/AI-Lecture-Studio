// @vitest-environment node
import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { readConfig } from "@/lib/ai/config";
import { runDiagnostics, redact } from "@/lib/ai/diagnostics";
import { classifyError, createGeminiGenerator, describeError, googleErrorFacts, type GenAiLike } from "@/lib/ai/gemini-client";
import { fakeGemini } from "./fake-gemini";

/**
 * Error bodies in the shape Google documents for the Gemini API. The SDK turns the JSON body into
 * ApiError.message (see throwErrorIfNotOK in @google/genai), so tests build the same thing.
 * They are representative samples, NOT responses captured from the live service.
 */
const body = (code: number, status: string, message: string, details: unknown[] = []) => new ApiError({ status: code, message: JSON.stringify({ error: { code, message, status, details } }) });
const errInvalidKey = () => body(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID", domain: "googleapis.com" }]);
const errNoModel = () => body(404, "NOT_FOUND", "models/nope is not found for API version v1beta, or is not supported for generateContent.");
const errDaily = () => body(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota, please check your plan and billing details.", [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }, { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "34s" }]);
const errMinute = () => body(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota.", [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }, { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "12s" }]);
const errBadSchema = () => body(400, "INVALID_ARGUMENT", "The schema is too complex / nesting depth exceeded.");

describe("error handling with Google-shaped error bodies", () => {
  it.each([
    ["invalid API key", errInvalidKey(), "invalid-api-key", false],
    ["model not found", errNoModel(), "ai-unavailable", false],
    ["daily free-tier quota", errDaily(), "quota-exhausted", false],
    ["per-minute rate limit", errMinute(), "rate-limited", true],
    ["rejected schema/request", errBadSchema(), "ai-unavailable", false],
    ["overloaded", body(503, "UNAVAILABLE", "The model is overloaded."), "ai-unavailable", true],
    ["server deadline", body(504, "DEADLINE_EXCEEDED", "Deadline expired"), "timeout", true],
  ])("%s", (_n, error, code, retryable) => {
    const c = classifyError(error);
    expect(c.error.code).toBe(code);
    expect(c.retryable).toBe(retryable);
  });

  it("gives distinct, helpful messages for model-not-found and rejected requests", () => {
    expect(classifyError(errNoModel()).error.message).toMatch(/GEMINI_MODEL/);
    expect(classifyError(errBadSchema()).error.message).toMatch(/configuration problem/);
    expect(classifyError(errNoModel()).error.message).not.toBe(classifyError(errBadSchema()).error.message);
  });

  it("reads the retry delay from Google's RetryInfo", () => {
    expect(classifyError(errMinute()).retryAfterMs).toBe(12_000);
  });

  it("extracts only short machine facts for diagnostics, never Google's free text", () => {
    expect(googleErrorFacts(errDaily())).toEqual({ httpStatus: 429, status: "RESOURCE_EXHAUSTED", reason: undefined, quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" });
    const d = describeError(classifyError(errInvalidKey()).error);
    expect(d).toBe("HTTP 400 INVALID_ARGUMENT API_KEY_INVALID");
    expect(d).not.toMatch(/Please pass/);
  });

  it("treats timeouts and aborts as timeouts", () => {
    expect(classifyError(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })).error.code).toBe("timeout");
  });
});

describe("request format", () => {
  const config = { ...readConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-3.8-flash", AI_MAX_OUTPUT_TOKENS: "20000" }), maxRetries: 0 };
  const make = (response: object) => {
    const generateContent = vi.fn(async () => response);
    return { generateContent, sdk: { models: { generateContent } } as unknown as GenAiLike };
  };
  const call = (c: ReturnType<typeof vi.fn>) => ((c.mock.calls[0] as unknown[])[0] as { model: string; contents: string; config: Record<string, unknown> });

  it("sends the structured-output settings the docs describe, without temperature, within the token cap", async () => {
    const { generateContent, sdk } = make({ text: "{}", candidates: [{ finishReason: "STOP" }] });
    await createGeminiGenerator(config, sdk)({ system: "sys", prompt: "p", jsonSchema: { type: "object" }, maxOutputTokens: 40_000 });
    const c = call(generateContent);
    expect(c.model).toBe("gemini-3.8-flash");
    expect(c.config.responseMimeType).toBe("application/json");
    expect(c.config.responseJsonSchema).toEqual({ type: "object" });
    expect(c.config.systemInstruction).toBe("sys");
    expect(c.config).not.toHaveProperty("temperature");
    expect(c.config.maxOutputTokens).toBe(20_000);
    expect(c.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(c.config).not.toHaveProperty("thinkingConfig");
  });

  it.each([
    ["MAX_TOKENS", "invalid-ai-response", /cut off/],
    ["CONTINUATION", "invalid-ai-response", /cut off/],
    ["SAFETY", "ai-blocked", /declined/],
    ["PROHIBITED_CONTENT", "ai-blocked", /declined/],
    ["MALFORMED_RESPONSE", "invalid-ai-response", /.*/],
    ["OTHER", "invalid-ai-response", /.*/],
  ])("finish reason %s", async (finishReason, code, message) => {
    const { sdk } = make({ text: '{"a":1}', candidates: [{ finishReason }] });
    const err = await createGeminiGenerator(config, sdk)({ system: "s", prompt: "p", jsonSchema: {} }).catch((e) => e);
    expect(err.code).toBe(code);
    expect(err.message).toMatch(message);
  });

  it("accepts a normal STOP answer and one without a finish reason", async () => {
    await expect(createGeminiGenerator(config, make({ text: '{"a":1}', candidates: [{ finishReason: "STOP" }] }).sdk)({ system: "s", prompt: "p", jsonSchema: {} })).resolves.toBe('{"a":1}');
    await expect(createGeminiGenerator(config, make({ text: '{"a":1}' }).sdk)({ system: "s", prompt: "p", jsonSchema: {} })).resolves.toBe('{"a":1}');
  });
});

describe("diagnostics", () => {
  const config = { ...readConfig({ GEMINI_API_KEY: "AIzaSyDUMMYKEYDUMMYKEYDUMMYKEY12345", GEMINI_MODEL: "gemini-3.8-flash" }), maxRetries: 0 };
  const sdk = (over: Partial<GenAiLike["models"]> = {}): GenAiLike => ({
    models: {
      get: async () => ({ displayName: "Gemini 3.8 Flash", inputTokenLimit: 1_048_576, outputTokenLimit: 65_536, supportedActions: ["generateContent", "countTokens"] }),
      generateContent: async () => ({ text: "{}" }),
      ...over,
    },
  });
  const ids = (r: Awaited<ReturnType<typeof runDiagnostics>>) => Object.fromEntries(r.checks.map((c) => [c.id, c.status]));

  it("without a key it fails clearly and makes no request", async () => {
    const r = await runDiagnostics({ ...config, apiKey: undefined }, "full");
    expect(r.ok).toBe(false);
    expect(ids(r)).toMatchObject({ config: "fail", model: "skipped" });
    expect(r.receivedGeminiResponse).toBe(false);
    expect(r.generateRequests).toBe(0);
  });

  it("models mode checks the model without any generation request", async () => {
    const generateContent = vi.fn();
    const r = await runDiagnostics(config, "models", { sdk: sdk({ generateContent }) });
    expect(ids(r)).toMatchObject({ config: "pass", model: "pass", "structured-output": "skipped" });
    expect(generateContent).not.toHaveBeenCalled();
    expect(r.receivedGeminiResponse).toBe(false);
    expect(r.checks.find((c) => c.id === "model")!.detail).toMatch(/65536/);
  });

  it.each([
    ["invalid key", errInvalidKey(), "invalid-api-key"],
    ["model not found", errNoModel(), "ai-unavailable"],
    ["daily quota", errDaily(), "quota-exhausted"],
  ])("reports a failed model lookup: %s (and spends no quota on generation)", async (_n, error, code) => {
    const generateContent = vi.fn();
    const r = await runDiagnostics(config, "full", { sdk: sdk({ get: async () => { throw error; }, generateContent }) });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === "model")).toMatchObject({ status: "fail", code });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("flags a model that cannot generate content and an over-large token limit", async () => {
    const noGen = await runDiagnostics(config, "models", { sdk: sdk({ get: async () => ({ supportedActions: ["embedContent"] }) }) });
    expect(ids(noGen).model).toBe("fail");
    const tooBig = await runDiagnostics({ ...config, maxOutputTokens: 60_000 }, "models", { sdk: sdk({ get: async () => ({ outputTokenLimit: 8_192, supportedActions: ["generateContent"] }) }) });
    expect(ids(tooBig).model).toBe("warn");
    expect(tooBig.ok).toBe(true);
  });

  it("generate mode verifies structured output; a wrong shape or an API error fails it", async () => {
    const good = await runDiagnostics(config, "generate", { sdk: sdk(), generator: async () => '{"ok":true,"word":"ready"}' });
    expect(ids(good)).toMatchObject({ "structured-output": "pass", "plan-schema": "skipped" });
    expect(good.receivedGeminiResponse).toBe(true);
    expect(good.generateRequests).toBe(1);
    const wrong = await runDiagnostics(config, "generate", { sdk: sdk(), generator: async () => '{"nope":1}' });
    expect(ids(wrong)["structured-output"]).toBe("fail");
    const down = await runDiagnostics(config, "generate", { sdk: sdk(), generator: async () => { throw classifyError(errMinute()).error; } });
    expect(down.checks.find((c) => c.id === "structured-output")).toMatchObject({ status: "fail", code: "rate-limited" });
    expect(down.receivedGeminiResponse).toBe(false);
  });

  it("full mode runs the real planner and analyzer schemas on the built-in sample", async () => {
    const fake = fakeGemini();
    const echo = async (r: Parameters<typeof fake>[0], s?: AbortSignal) => ("ok" in ((r.jsonSchema as { properties: object }).properties) ? '{"ok":true,"word":"ready"}' : fake(r, s));
    const r = await runDiagnostics(config, "full", { sdk: sdk(), generator: echo });
    expect(ids(r)).toEqual({ config: "pass", model: "pass", "structured-output": "pass", "plan-schema": "pass", "digest-schema": "pass" });
    expect(r.ok).toBe(true);
    expect(r.generateRequests).toBe(3);
  });

  it("never exposes the API key or Google's free-text error message", async () => {
    const leaky = new ApiError({ status: 403, message: JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: `Key ${config.apiKey} is blocked for project 12345` } }) });
    const r = await runDiagnostics(config, "full", { sdk: sdk({ get: async () => { throw leaky; } }) });
    const text = JSON.stringify(r);
    expect(text).not.toContain(config.apiKey!);
    expect(text).not.toMatch(/AIza|blocked for project/);
    expect(text).toContain("PERMISSION_DENIED");
  });

  it("only sends the built-in sample, never user content", async () => {
    const prompts: string[] = [];
    await runDiagnostics(config, "full", { sdk: sdk(), generator: async (r) => (prompts.push(r.prompt), "{}") });
    expect(prompts.join("\n")).toContain("Water Cycle Basics");
  });

  it("redact removes key-like strings and the configured key", () => {
    expect(redact("a AIzaSyABCDEFGHIJKLMNOPQRSTUV b")).toBe("a [redacted] b");
    expect(redact("token=secret-value-123", "secret-value-123")).toBe("token=[redacted]");
  });
});
