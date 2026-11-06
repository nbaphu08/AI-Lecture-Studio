// @vitest-environment node
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "@/lib/ai/config";
import { requestAiPlan } from "@/lib/analyze-client";
import { buildPresentation, STAGES, type Stage } from "@/lib/pipeline";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { aiError, isAiServiceFailure } from "@/lib/utils/errors";
import { fakeGemini } from "./fake-gemini";
import { makeServer } from "./harness";
import { longLecture, shortLecture } from "./fixtures";

const { window } = new JSDOM("");
Object.assign(globalThis, { DOMParser: window.DOMParser, Node: window.Node });

const config = { ...readConfig({ GEMINI_API_KEY: "k" }), maxRetries: 0 };

/** Route the browser's fetch straight into the server handlers, without a network. */
function serve(generator = fakeGemini(), over: Partial<typeof config> = {}) {
  const server = makeServer(generator, { ...config, ...over });
  const fetchImpl = vi.fn(server.fetchImpl);
  vi.stubGlobal("fetch", fetchImpl);
  return { fetchImpl, generator, server };
}

afterEach(() => vi.unstubAllGlobals());

describe("browser ↔ /api/analyze", () => {
  it("runs the full pipeline: stages, AI plan, deck, valid PPTX", async () => {
    const { generator } = serve();
    const stages: Stage[] = [];
    const result = await buildPresentation(shortLecture(), "lecture.docx", DEFAULT_SETTINGS, (s) => stages.push(s));
    expect(stages).toEqual(["segmenting", "analyzing", "planning", "generating", "validating"]);
    expect(generator.calls).toHaveLength(1);
    expect(result.planner).toBe("ai");
    expect(result.plan.slides[0].kind).toBe("cover");
    expect(result.blob.size).toBeGreaterThan(5_000);
    expect(result.downloadName).toMatch(/\.pptx$/);
  });

  it("reports every stage, with real chunk counts, for a document that needs chunking", async () => {
    serve(fakeGemini(), { singleCallChars: 5_000, chunkChars: 12_000 });
    const events: string[] = [];
    await buildPresentation(longLecture(20), "long.docx", DEFAULT_SETTINGS, (s, d) => events.push(d ? `${s}:${d}` : s));
    expect(events[0]).toBe("segmenting");
    expect(events.filter((e) => e.startsWith("analyzing:")).at(0)).toMatch(/^analyzing:0 of \d+ chunks$/);
    const last = events.filter((e) => e.startsWith("analyzing:")).at(-1)!;
    const [, done, total] = /(\d+) of (\d+) chunks/.exec(last)!;
    expect(done).toBe(total);
    expect(events.slice(-3)).toEqual(["planning", "generating", "validating"]);
    expect(STAGES.map((s) => s.id)).toEqual(["reading", "segmenting", "analyzing", "consolidating", "planning", "generating", "validating"]);
  });

  it("marks consolidating as not needed when the outline already fits", async () => {
    serve();
    const skipped: Stage[][] = [];
    await buildPresentation(shortLecture(), "a.docx", DEFAULT_SETTINGS, () => {}, { onSkipped: (s) => skipped.push(s) });
    expect(skipped).toEqual([["consolidating"]]);
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
    const init = fetchImpl.mock.calls.find((c) => String(c[0]).endsWith("/api/analyze"))![1]!;
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
    const server = makeServer(null, { ...config, apiKey: undefined });
    vi.stubGlobal("fetch", vi.fn(server.fetchImpl));
    const err = await buildPresentation(shortLecture(), "a.docx", DEFAULT_SETTINGS, () => {}).catch((e) => e);
    expect(err.code).toBe("missing-api-key");
    expect(err.message).not.toMatch(/GEMINI_API_KEY|AIza/);
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
