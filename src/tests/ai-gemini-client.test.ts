// @vitest-environment node
import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { readConfig } from "@/lib/ai/config";
import { classifyError, createGeminiGenerator, withRetries, type GenAiLike } from "@/lib/ai/gemini-client";
import { AppError } from "@/lib/utils/errors";

const api = (status: number, message: string) => new ApiError({ status, message });
const noSleep = async () => {};

describe("classifyError", () => {
  it.each([
    [api(429, '{"error":{"message":"You exceeded your current quota","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}'), "quota-exhausted", false],
    [api(429, '{"error":{"message":"Quota exceeded for metric GenerateContentRequestsPerMinute. Please retry in 12s."}}'), "rate-limited", true],
    [api(400, "API key not valid. Please pass a valid API key."), "invalid-api-key", false],
    [api(403, "PERMISSION_DENIED"), "invalid-api-key", false],
    [api(503, "The model is overloaded"), "ai-unavailable", true],
    [api(500, "internal"), "ai-unavailable", true],
    [api(404, "model not found"), "ai-unavailable", false],
    [new TypeError("fetch failed"), "network", true],
    [Object.assign(new Error("x"), { name: "TimeoutError" }), "timeout", false],
  ])("%#", (error, code, retryable) => {
    const c = classifyError(error);
    expect(c.error.code).toBe(code);
    expect(c.retryable).toBe(retryable);
  });

  it("reads the retry delay suggested by the service", () => {
    expect(classifyError(api(429, "Quota exceeded for GenerateContentRequestsPerMinute. Please retry in 12.5s.")).retryAfterMs).toBe(12_500);
  });

  it("produces user-safe messages without internals", () => {
    const c = classifyError(api(500, "stack: at secret/path/file.ts:12 key=AIzaSyFAKEKEY"));
    expect(c.error.message).not.toMatch(/AIza|secret|stack/);
  });
});

describe("withRetries", () => {
  it("retries temporary errors with exponential backoff, then succeeds", async () => {
    const sleeps: number[] = [];
    let n = 0;
    const result = await withRetries(
      async () => {
        if (++n < 3) throw api(503, "overloaded");
        return "ok";
      },
      { maxRetries: 3, baseDelayMs: 1000, random: () => 0.5, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(result).toBe("ok");
    expect(sleeps).toEqual([1000, 2000]);
  });

  it("gives up after the retry limit and reports the failure", async () => {
    const fn = vi.fn(async () => {
      throw api(503, "overloaded");
    });
    await expect(withRetries(fn, { maxRetries: 2, sleep: noSleep })).rejects.toMatchObject({ code: "ai-unavailable" });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry quota exhaustion or invalid keys", async () => {
    const quota = vi.fn(async () => {
      throw api(429, "exceeded GenerateRequestsPerDayPerProjectPerModel-FreeTier");
    });
    await expect(withRetries(quota, { maxRetries: 5, sleep: noSleep })).rejects.toMatchObject({ code: "quota-exhausted" });
    expect(quota).toHaveBeenCalledTimes(1);
    const key = vi.fn(async () => {
      throw api(403, "denied");
    });
    await expect(withRetries(key, { maxRetries: 5, sleep: noSleep })).rejects.toMatchObject({ code: "invalid-api-key" });
    expect(key).toHaveBeenCalledTimes(1);
  });

  it("stops instead of waiting for a very long retry delay", async () => {
    const fn = vi.fn(async () => {
      throw api(429, "Quota exceeded for GenerateContentRequestsPerMinute. Please retry in 300s.");
    });
    await expect(withRetries(fn, { maxRetries: 3, maxDelayMs: 30_000, sleep: noSleep })).rejects.toMatchObject({ code: "rate-limited" });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("createGeminiGenerator", () => {
  const config = { ...readConfig({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "my-model" }), maxRetries: 0 };
  const request = { system: "s", prompt: "p", jsonSchema: { type: "object" } };
  const sdk = (response: Awaited<ReturnType<GenAiLike["models"]["generateContent"]>>) => {
    const generateContent = vi.fn(async () => response);
    return { sdk: { models: { generateContent } } as unknown as GenAiLike, generateContent };
  };

  it("calls the configured model with structured-output settings and returns the text", async () => {
    const { sdk: fake, generateContent } = sdk({ text: '{"a":1}', candidates: [{ finishReason: "STOP" }] });
    const text = await createGeminiGenerator(config, fake)(request);
    expect(text).toBe('{"a":1}');
    const call = generateContent.mock.calls[0] as unknown as [{ model: string; config: Record<string, unknown> }];
    expect(call[0].model).toBe("my-model");
    expect(call[0].config.responseMimeType).toBe("application/json");
    expect(call[0].config.responseJsonSchema).toEqual({ type: "object" });
    expect(call[0].config.systemInstruction).toBe("s");
  });

  it("maps blocked, truncated and empty answers to clear errors", async () => {
    await expect(createGeminiGenerator(config, sdk({ text: "x", promptFeedback: { blockReason: "SAFETY" } }).sdk)(request)).rejects.toMatchObject({ code: "ai-blocked" });
    await expect(createGeminiGenerator(config, sdk({ text: "{", candidates: [{ finishReason: "MAX_TOKENS" }] }).sdk)(request)).rejects.toMatchObject({ code: "invalid-ai-response" });
    await expect(createGeminiGenerator(config, sdk({ text: "  " }).sdk)(request)).rejects.toMatchObject({ code: "invalid-ai-response" });
  });

  it("requires an API key and never puts it in error messages", async () => {
    expect(() => createGeminiGenerator(readConfig({}))).toThrowError(AppError);
    const failing = { models: { generateContent: async () => { throw api(403, "key=test-key rejected"); } } } as unknown as GenAiLike;
    const err = await createGeminiGenerator(config, failing)(request).catch((e: AppError) => e);
    expect((err as AppError).message).not.toContain("test-key");
  });
});

describe("readConfig", () => {
  it("reads the model and limits from the environment, with safe defaults and clamping", () => {
    const c = readConfig({ GEMINI_API_KEY: " k ", GEMINI_MODEL: "m", AI_CONCURRENCY: "99", AI_CHUNK_CHARS: "abc" });
    expect(c.apiKey).toBe("k");
    expect(c.model).toBe("m");
    expect(c.concurrency).toBe(6);
    expect(c.chunkChars).toBe(24_000);
    expect(readConfig({}).apiKey).toBeUndefined();
    // GOOGLE_API_KEY is accepted as a fallback; GEMINI_API_KEY wins when both are set.
    expect(readConfig({ GOOGLE_API_KEY: "g" }).apiKey).toBe("g");
    expect(readConfig({ GEMINI_API_KEY: "a", GOOGLE_API_KEY: "g" }).apiKey).toBe("a");
  });
});
