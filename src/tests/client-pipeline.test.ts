// @vitest-environment node
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "@/lib/ai/config";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { handleAnalyze } from "@/lib/ai/route-handler";
import { requestAiPlan } from "@/lib/analyze-client";
import { buildPresentation, STAGES, type Stage } from "@/lib/pipeline";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { aiError, isAiServiceFailure } from "@/lib/utils/errors";
import { fakeGemini } from "./fake-gemini";
import { longLecture, shortLecture } from "./fixtures";

const { window } = new JSDOM("");
Object.assign(globalThis, { DOMParser: window.DOMParser, Node: window.Node });

const config = { ...readConfig({ GEMINI_API_KEY: "k" }), maxRetries: 0 };

/** Route the browser's fetch straight into the server handler, without a network. */
function serve(generator = fakeGemini(), over: Partial<typeof config> = {}) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    return handleAnalyze(new Request(`http://localhost${url}`, init), {
      config: { ...config, ...over },
      limiter: createRateLimiter(100, 60_000),
      state: { inFlight: 0 },
      makeGenerator: () => generator,
    });
  });
  vi.stubGlobal("fetch", fetchImpl);
  return { fetchImpl, generator, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe("browser ↔ /api/analyze", () => {
  it("runs the full pipeline: stages, AI plan, deck, valid PPTX", async () => {
    const { generator } = serve();
    const stages: Stage[] = [];
    const result = await buildPresentation(shortLecture(), "lecture.docx", DEFAULT_SETTINGS, (s) => stages.push(s));
    expect(stages).toEqual(["analyzing", "planning", "generating", "validating"]);
    expect(generator.calls).toHaveLength(1);
    expect(result.planner).toBe("ai");
    expect(result.plan.slides[0].kind).toBe("cover");
    expect(result.blob.size).toBeGreaterThan(5_000);
    expect(result.downloadName).toMatch(/\.pptx$/);
  });

  it("reports summarizing only for documents that needed it", async () => {
    serve(fakeGemini(), { singleCallChars: 5_000, chunkChars: 12_000 });
    const stages: Stage[] = [];
    await buildPresentation(longLecture(20), "long.docx", DEFAULT_SETTINGS, (s) => stages.push(s));
    expect(stages).toEqual(["analyzing", "summarizing", "planning", "generating", "validating"]);
    expect(STAGES.map((s) => s.id)).toEqual(["reading", "analyzing", "summarizing", "planning", "generating", "validating"]);
  });

  it("marks the summarizing stage as not needed for short documents", async () => {
    serve();
    const skipped: Stage[][] = [];
    await buildPresentation(shortLecture(), "a.docx", DEFAULT_SETTINGS, () => {}, { onSkipped: (s) => skipped.push(s) });
    expect(skipped).toEqual([["summarizing"]]);
  });

  it("reuses a received AI plan instead of asking the AI again", async () => {
    const { generator } = serve();
    let cached: Parameters<NonNullable<Parameters<typeof buildPresentation>[4]>["onAiPlan"] & object>[0] | undefined;
    await buildPresentation(shortLecture(), "a.docx", DEFAULT_SETTINGS, () => {}, { onAiPlan: (r) => (cached = r) });
    expect(generator.calls).toHaveLength(1);
    const stages: Stage[] = [];
    const again = await buildPresentation(shortLecture(), "a.docx", { ...DEFAULT_SETTINGS, themeId: "midnight" }, (s) => stages.push(s), { cachedAiPlan: cached });
    expect(generator.calls).toHaveLength(1);
    expect(stages).toEqual(["generating", "validating"]);
    expect(again.settings.themeId).toBe("midnight");
  });

  it("sends only text to the server: no image data, and the request has no API key", async () => {
    const { fetchImpl } = serve();
    const doc = shortLecture();
    doc.blocks.push({ id: "bX", type: "image", src: "data:image/png;base64,SECRETIMAGEBYTES", alt: "pic" });
    await buildPresentation(doc, "a.docx", DEFAULT_SETTINGS, () => {});
    const init = fetchImpl.mock.calls[0][1]!;
    expect(String(init.body)).not.toContain("SECRETIMAGEBYTES");
    expect(String(init.body)).toContain('"alt":"pic"');
    expect(JSON.stringify(init.headers)).not.toMatch(/key|authorization/i);
  });

  it("surfaces quota exhaustion with the friendly message", async () => {
    serve(fakeGemini({ override: () => { throw aiError("quota-exhausted"); } }));
    const err = await buildPresentation(shortLecture(), "a.docx", DEFAULT_SETTINGS, () => {}).catch((e) => e);
    expect(err.code).toBe("quota-exhausted");
    expect(err.message).toMatch(/usage limit/);
    expect(isAiServiceFailure(err)).toBe(true);
  });

  it("surfaces a missing API key without exposing configuration", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      handleAnalyze(new Request(`http://localhost${url}`, init), { config: { ...config, apiKey: undefined }, limiter: createRateLimiter(9, 1000), state: { inFlight: 0 } }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const err = await buildPresentation(shortLecture(), "a.docx", DEFAULT_SETTINGS, () => {}).catch((e) => e);
    expect(err.code).toBe("missing-api-key");
  });

  it("maps network failures and timeouts to friendly errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await requestAiPlan(shortLecture(), { density: "balanced", preferDiagrams: false }, () => {}).catch((e) => e)).toMatchObject({ code: "network" });
    const aborted = new AbortController();
    aborted.abort();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("x", "AbortError"); }));
    expect(await requestAiPlan(shortLecture(), { density: "balanced", preferDiagrams: false, signal: aborted.signal }, () => {}).catch((e) => e)).toMatchObject({ code: expect.stringMatching(/network|timeout/) });
  });

  it("treats a server response that is not a valid plan as an invalid AI response", async () => {
    const body = `${JSON.stringify({ type: "result", plan: { presentationTitle: "", slides: [] }, warnings: [], meta: { model: "m" } })}\n`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    expect(await requestAiPlan(shortLecture(), { density: "balanced", preferDiagrams: false }, () => {}).catch((e) => e)).toMatchObject({ code: "invalid-ai-response" });
  });

  it("falls back to the built-in planner only when explicitly asked, and says so", async () => {
    const { fetchImpl } = serve();
    const result = await buildPresentation(shortLecture(), "a.docx", DEFAULT_SETTINGS, () => {}, { planner: "basic" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.planner).toBe("basic");
    expect(result.plan.warnings[0]).toMatch(/basic offline planner/);
  });
});
