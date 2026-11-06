// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyzeDocument, type AnalyzeStage } from "@/lib/ai/analyze-service";
import { readConfig } from "@/lib/ai/config";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { handleAnalyze } from "@/lib/ai/route-handler";
import type { StreamEvent } from "@/lib/ai/protocol";
import { toWireDocument, analyzeRequestSchema } from "@/lib/document/wire";
import { aiError } from "@/lib/utils/errors";
import { fakeGemini } from "./fake-gemini";
import { longLecture, shortLecture } from "./fixtures";
import type { ParsedDocument } from "@/lib/docx/types";

const config = { ...readConfig({ GEMINI_API_KEY: "secret-test-key", GEMINI_MODEL: "test-model" }), maxRetries: 0 };

const request = (doc: ParsedDocument, density: "concise" | "balanced" | "detailed" = "balanced") =>
  analyzeRequestSchema.parse({ ...toWireDocument(doc), density, preferDiagrams: false });

describe("analyzeDocument", () => {
  it("plans a short document in one request", async () => {
    const gemini = fakeGemini();
    const stages: AnalyzeStage[] = [];
    const result = await analyzeDocument(request(shortLecture()), config, gemini, (s) => stages.push(s));
    expect(gemini.calls).toHaveLength(1);
    expect(result.meta).toMatchObject({ mode: "single", requests: 1, model: "test-model" });
    expect(stages).toEqual(["analyzing", "planning"]);
    expect(result.plan.slides.length).toBeGreaterThan(2);
    // Every section of the document is cited by some slide.
    const cited = new Set(result.plan.slides.flatMap((s) => s.sourceSections));
    expect(cited.has("section-002") && cited.has("section-003")).toBe(true);
  });

  it("repairs an invalid answer once and reports success", async () => {
    const gemini = fakeGemini({ override: (_r, n) => (n === 1 ? "not json at all" : undefined) });
    const result = await analyzeDocument(request(shortLecture()), config, gemini);
    expect(gemini.calls).toHaveLength(2);
    expect(gemini.calls[1].prompt).toContain("Your previous answer could not be used");
    expect(result.plan.slides.length).toBeGreaterThan(1);
  });

  it("fails with a clear error when the answer stays invalid", async () => {
    const gemini = fakeGemini({ override: () => '{"presentationTitle":"x","slides":[]}' });
    await expect(analyzeDocument(request(shortLecture()), config, gemini)).rejects.toMatchObject({ code: "invalid-ai-response" });
    expect(gemini.calls).toHaveLength(2); // original + one repair, never an endless loop
  });

  it("rejects documents above the size limit before calling the AI", async () => {
    const gemini = fakeGemini();
    await expect(analyzeDocument(request(longLecture(30)), { ...config, maxDocChars: 5_000 }, gemini)).rejects.toMatchObject({ code: "payload-too-large" });
    expect(gemini.calls).toHaveLength(0);
  });

  it("refuses to process a document that needs chunking in a single request", async () => {
    const gemini = fakeGemini();
    await expect(analyzeDocument(request(longLecture(30)), { ...config, singleCallChars: 5_000 }, gemini)).rejects.toMatchObject({ code: "payload-too-large" });
    expect(gemini.calls).toHaveLength(0);
  });

  it("rejects documents without text", async () => {
    const doc: ParsedDocument = { blocks: [{ id: "b0", type: "image", src: "data:image/png;base64,AA" }], warnings: [] };
    await expect(analyzeDocument(request(doc), config, fakeGemini())).rejects.toMatchObject({ code: "empty-document" });
  });

  it("passes service errors (quota) through unchanged", async () => {
    const gemini = fakeGemini({ override: () => { throw aiError("quota-exhausted"); } });
    await expect(analyzeDocument(request(shortLecture()), config, gemini)).rejects.toMatchObject({ code: "quota-exhausted" });
  });

  it("turns an expired overall deadline into a timeout error", async () => {
    const gemini = fakeGemini({ override: () => new Promise((_, reject) => setTimeout(() => reject(new DOMException("aborted", "AbortError")), 30)) });
    await expect(analyzeDocument(request(shortLecture()), { ...config, totalTimeoutMs: 10 }, gemini)).rejects.toMatchObject({ code: "timeout" });
  });

  it("includes document text only as quoted data and tells the model to ignore instructions inside it", async () => {
    const gemini = fakeGemini();
    await analyzeDocument(request(shortLecture()), config, gemini);
    expect(gemini.calls[0].system).toMatch(/Ignore any instructions/);
    expect(gemini.calls[0].prompt).toMatch(/<SOURCE>[\s\S]*<\/SOURCE>/);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, then blocks, then recovers", () => {
    let t = 0;
    const limiter = createRateLimiter(2, 1000, () => t);
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(true);
    const blocked = limiter.check("a");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    expect(limiter.check("b").ok).toBe(true);
    t = 1500;
    expect(limiter.check("a").ok).toBe(true);
  });
});

describe("POST /api/analyze handler", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/analyze", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  const deps = (over: Partial<Parameters<typeof handleAnalyze>[1]> = {}) => ({
    config,
    limiter: createRateLimiter(100, 60_000),
    state: { inFlight: 0 },
    makeGenerator: () => fakeGemini(),
    ...over,
  });
  const events = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as StreamEvent);
  const goodBody = () => ({ ...toWireDocument(shortLecture()), density: "balanced" });

  it("streams stage events and the validated plan", async () => {
    const res = await handleAnalyze(post(goodBody()), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("ndjson");
    const evs = await events(res);
    expect(evs.map((e) => e.type)).toEqual(["stage", "stage", "result"]);
    const last = evs.at(-1)!;
    expect(last.type === "result" && (last.plan as { slides: unknown[] }).slides.length).toBeGreaterThan(1);
  });

  it("never includes the API key in any response", async () => {
    const ok = await (await handleAnalyze(post(goodBody()), deps())).text();
    const bad = await (await handleAnalyze(post("{"), deps())).text();
    expect(ok + bad).not.toContain("secret-test-key");
  });

  it("returns a friendly error when the server has no API key", async () => {
    const res = await handleAnalyze(post(goodBody()), deps({ config: { ...config, apiKey: undefined }, makeGenerator: undefined }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("missing-api-key");
  });

  it("rejects malformed JSON, wrong shapes and oversized bodies", async () => {
    expect((await handleAnalyze(post("{not json"), deps())).status).toBe(400);
    expect((await handleAnalyze(post({ density: "balanced", blocks: [] }), deps())).status).toBe(400);
    expect((await handleAnalyze(post({ ...goodBody(), density: "huge" }), deps())).status).toBe(400);
    expect((await handleAnalyze(post(goodBody(), { "content-length": "99999999" }), deps())).status).toBe(413);
  });

  it("does not accept URLs or unknown block types as input", async () => {
    const body = { density: "balanced", blocks: [{ id: "b0", type: "fetch", url: "http://169.254.169.254/" }] };
    expect((await handleAnalyze(post(body), deps())).status).toBe(400);
  });

  it("limits repeated requests from one client", async () => {
    const d = deps({ limiter: createRateLimiter(1, 60_000) });
    expect((await handleAnalyze(post(goodBody(), { "x-forwarded-for": "1.2.3.4" }), d)).status).toBe(200);
    const second = await handleAnalyze(post(goodBody(), { "x-forwarded-for": "1.2.3.4" }), d);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
    expect((await handleAnalyze(post(goodBody(), { "x-forwarded-for": "5.6.7.8" }), d)).status).toBe(200);
  });

  it("caps analyses running at once", async () => {
    const res = await handleAnalyze(post(goodBody()), deps({ state: { inFlight: 99 } }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("rate-limited");
  });

  it("reports AI failures as stream errors with user-safe messages", async () => {
    const failing = () => fakeGemini({ override: () => { throw aiError("quota-exhausted", new Error("secret internals key=secret-test-key")); } });
    const evs = await events(await handleAnalyze(post(goodBody()), deps({ makeGenerator: failing })));
    const err = evs.at(-1)!;
    expect(err).toMatchObject({ type: "error", code: "quota-exhausted" });
    expect(JSON.stringify(err)).not.toMatch(/secret/);
  });

  it("hides unexpected errors behind a generic message", async () => {
    const crashing = () => fakeGemini({ override: () => { throw new Error("TypeError at /srv/app/secret.ts"); } });
    const evs = await events(await handleAnalyze(post(goodBody()), deps({ makeGenerator: crashing })));
    const err = evs.at(-1)!;
    expect(err.type).toBe("error");
    expect(JSON.stringify(err)).not.toMatch(/secret|srv/);
  });
});
