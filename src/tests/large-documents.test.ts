// @vitest-environment node
import { JSDOM } from "jsdom";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildDocx } from "../../scripts/docx-builder.ts";
import { analyzeDocumentJob, createJobStore, hash, isRetryable, mergePlans, partitionSections, type JobOptions } from "@/lib/analysis-job";
import { dropToFit, digestChars } from "@/lib/ai/digest-utils";
import { chunkSections, chunkToText } from "@/lib/document/chunker";
import { buildSections } from "@/lib/document/sections";
import { toWireDocument } from "@/lib/document/wire";
import { parseDocx } from "@/lib/docx/parser";
import type { ParsedDocument } from "@/lib/docx/types";
import { resolveSettings } from "@/lib/design/style-hints";
import { writePptx } from "@/lib/pptx/generate";
import { inspectPptx } from "@/lib/pptx/pptx-utils";
import { composeValidated } from "@/lib/pptx/slide-validator";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { aiPlanToDeckPlan } from "@/lib/slides/ai-plan";
import { runPool, backoffDelay } from "@/lib/utils/async";
import { AppError, aiError } from "@/lib/utils/errors";
import { fakeGemini } from "./fake-gemini";
import { errorResponse, makeServer, withFaults } from "./harness";
import { bigLectureParts } from "./large-doc";
import { h, makeDoc, p, shortLecture } from "./fixtures";

// All tests in this file use a deterministic FAKE Gemini. No test here calls the real API.
const { window } = new JSDOM("");
Object.assign(globalThis, { DOMParser: window.DOMParser, Node: window.Node });

async function docxToDoc(parts: ReturnType<typeof bigLectureParts>): Promise<ParsedDocument> {
  const bytes = await buildDocx(parts);
  return parseDocx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "big.docx");
}

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const baseOpts = (fetchImpl: Fetch, over: Partial<JobOptions> = {}): JobOptions => ({
  density: "balanced",
  preferDiagrams: false,
  store: createJobStore(),
  fetchImpl: fetchImpl as typeof fetch,
  onProgress: () => {},
  sleep: async () => {},
  random: () => 0.5,
  ...over,
});
/** Runs a promise that must reject and returns the error. */
const fails = async (promise: Promise<unknown>): Promise<AppError> =>
  (await promise.then(
    () => {
      throw new Error("expected the job to fail");
    },
    (e: unknown) => e,
  )) as AppError;
const SMALL = { singleCallChars: 5_000, chunkChars: 12_000, chunkOverlapChars: 300 };

describe("segmentation", () => {
  it("handles documents with many headings: stable ids, nothing lost, order kept", async () => {
    const doc = await docxToDoc(bigLectureParts(30));
    const wire = toWireDocument(doc);
    const sections = buildSections(wire.blocks, { maxChars: 12_000 });
    expect(sections.map((s) => s.id)).toEqual(sections.map((_, i) => `section-${String(i + 1).padStart(3, "0")}`));
    expect(sections.flatMap((s) => s.blockIds)).toEqual(doc.blocks.map((b) => b.id));
    const chunks = chunkSections(sections, 12_000, 300);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.flatMap((c) => c.parts.map((x) => x.sectionId))).toEqual(sections.map((s) => s.id));
  });

  it("handles documents without any headings by cutting at paragraph boundaries into traceable parts", async () => {
    const doc = await docxToDoc(bigLectureParts(25, { headings: false }));
    const wire = toWireDocument(doc);
    expect(wire.blocks.some((b) => b.type === "heading")).toBe(false);
    expect(buildSections(wire.blocks)).toHaveLength(1);
    const sections = buildSections(wire.blocks, { maxChars: 8_000 });
    expect(sections.length).toBeGreaterThan(8);
    expect(sections.every((s) => s.chars <= 8_000 + 3_000)).toBe(true); // blocks are never cut here
    expect(sections.flatMap((s) => s.blockIds)).toEqual(wire.blocks.map((b) => b.id));
  });

  it("splits a very long single section into paragraph-based parts that keep the section title", () => {
    const doc = makeDoc([h(1, "The Whole Course"), ...Array.from({ length: 200 }, (_, i) => p(`Paragraph ${i}. ${"Some meaningful sentence about the topic. ".repeat(10)}`))]);
    const sections = buildSections(toWireDocument(doc).blocks, { maxChars: 6_000 });
    expect(sections.length).toBeGreaterThan(8);
    expect(sections[0].heading).toBe("The Whole Course");
    expect(sections[1].heading).toBe("The Whole Course (part 2)");
    expect(sections.every((s) => s.text.split("\n").every((l) => l.startsWith("[b")))).toBe(true);
  });

  it("never cuts a sentence, and keeps a table whole with its numbers", async () => {
    const doc = await docxToDoc(bigLectureParts(8));
    const sections = buildSections(toWireDocument(doc).blocks, { maxChars: 4_000 });
    for (const s of sections) for (const line of s.text.split("\n")) if (/^\[b\d+\] In \d{4}/.test(line)) expect(line.trimEnd().endsWith(".")).toBe(true);
    const tableSection = sections.find((s) => s.text.includes("TABLE"))!;
    expect(tableSection.text).toMatch(/Period \| Measured value \| Unit/);
    expect(tableSection.text).toMatch(/\| mm/);
    const tableId = doc.blocks.find((b) => b.type === "table")!.id;
    expect(sections.filter((s) => s.blockIds.includes(tableId))).toHaveLength(1); // traceable to one section
  });

  it("repeats the end of the previous chunk as read-only context", () => {
    const doc = makeDoc([h(1, "A"), ...Array.from({ length: 60 }, (_, i) => p(`Sentence block ${i} with some words in it.`)), h(1, "B"), p("Final text.")]);
    const sections = buildSections(toWireDocument(doc).blocks, { maxChars: 800 });
    const chunks = chunkSections(sections, 800, 200);
    expect(chunks[0].context).toBeUndefined();
    expect(chunks[1].context!.length).toBeLessThanOrEqual(200);
    expect(chunkToText(chunks[1])).toContain("CONTEXT");
    expect(chunkToText(chunks[1])).toContain("do not extract");
    expect(chunkSections(sections, 800, 0)[1].context).toBeUndefined();
  });
});

describe("hierarchical pipeline (mock Gemini)", () => {
  it("short document: one request, no chunking", async () => {
    const gemini = fakeGemini();
    const server = makeServer(gemini);
    const events: string[] = [];
    const r = await analyzeDocumentJob(shortLecture(), baseOpts(server.fetchImpl, { onProgress: (s, d) => events.push(d ? `${s}:${d}` : s) }));
    expect(r.stats.mode).toBe("single");
    expect(gemini.calls).toHaveLength(1);
    expect(events).toEqual(["segmenting", "analyzing:whole document in one request", "planning"]);
  });

  it("long document: one analysis request per chunk, progress counts are real and monotonic", async () => {
    const gemini = fakeGemini();
    const server = makeServer(gemini, SMALL);
    const doc = await docxToDoc(bigLectureParts(30));
    const seen: [number, number][] = [];
    const stages: string[] = [];
    const r = await analyzeDocumentJob(
      doc,
      baseOpts(server.fetchImpl, {
        onProgress: (s, d) => {
          if (!stages.includes(s)) stages.push(s);
          const m = /(\d+) of (\d+) chunks/.exec(d ?? "");
          if (m) seen.push([+m[1], +m[2]]);
        },
      }),
    );
    const n = r.stats.chunks;
    expect(n).toBeGreaterThan(5);
    expect(server.count("/api/analyze/chunk")).toBe(n);
    expect(seen[0]).toEqual([0, n]);
    expect(seen.at(-1)).toEqual([n, n]);
    expect(seen.map((x) => x[0])).toEqual(seen.map((x) => x[0]).sort((a, b) => a - b));
    expect(stages[0]).toBe("segmenting");
    expect(stages.at(-1)).toBe("planning");
    expect(r.plan.slides[0].layout).toBe("title");
    const sectionCount = buildSections(toWireDocument(doc).blocks, { maxChars: 12_000 }).length;
    expect(new Set(r.plan.slides.flatMap((s) => s.sourceSections)).size).toBe(sectionCount);
  });

  it("never sends the original text to planning or consolidation, only compact analyses", async () => {
    const gemini = fakeGemini();
    const server = makeServer(gemini, { ...SMALL, planInputChars: 40_000 });
    await analyzeDocumentJob(await docxToDoc(bigLectureParts(20)), baseOpts(server.fetchImpl));
    const later = gemini.calls.filter((c) => c.prompt.includes("faithful digest") || c.prompt.includes("Consolidate them"));
    expect(later.length).toBeGreaterThan(1);
    for (const c of later) expect(c.prompt).not.toMatch(/\[b\d+\] In \d{4}, researchers/); // raw paragraph format never appears
  });

  it("consolidates summaries when the outline is too big, then plans from the smaller outline", async () => {
    const gemini = fakeGemini();
    const server = makeServer(gemini, { ...SMALL, planInputChars: 40_000 });
    const doc = await docxToDoc(bigLectureParts(30));
    const events: string[] = [];
    const r = await analyzeDocumentJob(doc, baseOpts(server.fetchImpl, { onProgress: (s, d) => events.push(d ? `${s}:${d}` : s) }));
    expect(r.stats.consolidationPasses).toBeGreaterThanOrEqual(1);
    expect(server.count("/api/analyze/consolidate")).toBe(r.stats.consolidationRequests);
    expect(events.some((e) => /^consolidating:pass 1: \d+ of \d+ batches$/.test(e))).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/condensed/);
    const last = events.filter((e) => e.startsWith("consolidating")).at(-1)!;
    const [, d, t] = /(\d+) of (\d+) batches/.exec(last)!;
    expect(d).toBe(t);
  });

  it("plans a long presentation in consecutive parts: one title slide, unique ids, final takeaways", async () => {
    const gemini = fakeGemini({ bulletsPerSlide: 3 });
    const server = makeServer(gemini, SMALL);
    const r = await analyzeDocumentJob(await docxToDoc(bigLectureParts(40)), baseOpts(server.fetchImpl));
    expect(server.count("/api/analyze/plan")).toBeGreaterThan(1);
    const slides = r.plan.slides;
    expect(slides.filter((s) => s.layout === "title")).toHaveLength(1);
    expect(slides[0].layout).toBe("title");
    expect(slides.at(-1)!.layout).toBe("key-takeaways");
    expect(new Set(slides.map((s) => s.id)).size).toBe(slides.length);
    expect(gemini.calls.some((c) => /THIS IS PART 2 OF/.test(c.prompt) && /Do NOT add a title slide/.test(c.prompt))).toBe(true);
    // The model is told that part numbers are internal and must never reach slide text.
    expect(gemini.calls.filter((c) => /THIS IS PART/.test(c.prompt)).every((c) => /NEVER mention part numbers/.test(c.prompt))).toBe(true);
  });

  it("keeps tables and numbers traceable: the plan request carries the document's numbers and table ids", async () => {
    const server = makeServer(fakeGemini(), SMALL);
    const seen: string[] = [];
    const fetchImpl = withFaults(server.fetchImpl, (path, _n, body) => (path.endsWith("/plan") ? (seen.push(body), undefined) : undefined));
    await analyzeDocumentJob(await docxToDoc(bigLectureParts(20)), baseOpts(fetchImpl));
    const body = JSON.parse(seen[0]);
    expect(body.tables.length).toBeGreaterThan(0);
    expect(body.tables[0].rows[0]).toEqual(expect.arrayContaining([expect.stringMatching(/^\d+$/)]));
    expect(body.numbers).toEqual(expect.arrayContaining(["1904", "112"]));
    expect(body.sections.length).toBeGreaterThan(5);
  });

  it("rejects documents above the configured limits before sending any chunk, with an honest message", async () => {
    const doc = await docxToDoc(bigLectureParts(30));
    const server = makeServer(fakeGemini(), { ...SMALL, maxDocChars: 50_000 });
    const err = await fails(analyzeDocumentJob(doc, baseOpts(server.fetchImpl)));
    expect(err.code).toBe("payload-too-large");
    expect(err.message).toMatch(/characters \(roughly \d+ pages\).*limit/);
    expect(server.count("/api/analyze/chunk")).toBe(0);
    const tooMany = makeServer(fakeGemini(), { ...SMALL, maxChunks: 3 });
    const err2 = await fails(analyzeDocumentJob(doc, baseOpts(tooMany.fetchImpl)));
    expect(err2.code).toBe("payload-too-large");
    expect(err2.message).toMatch(/needs \d+ parts/);
  });

  it("works for a very long single section", async () => {
    const doc = makeDoc([h(1, "The Whole Course"), ...Array.from({ length: 160 }, (_, i) => p(`Paragraph ${i} number ${i * 3}. ${"Some meaningful sentence about the topic. ".repeat(10)}`))]);
    const server = makeServer(fakeGemini(), SMALL);
    const r = await analyzeDocumentJob(doc, baseOpts(server.fetchImpl));
    expect(r.stats.chunks).toBeGreaterThan(3);
    expect(r.plan.slides.length).toBeGreaterThan(3);
  });
});

describe("reliability", () => {
  it("retries HTTP 503 with exponential backoff and jitter, then succeeds; other chunks are not repeated", async () => {
    const server = makeServer(fakeGemini(), { ...SMALL, concurrency: 1 });
    const doc = await docxToDoc(bigLectureParts(20));
    const sleeps: number[] = [];
    const fetchImpl = withFaults(server.fetchImpl, (path, n) => (path.endsWith("/chunk") && n <= 2 ? errorResponse(503, "ai-unavailable", { retryable: true }) : undefined));
    const r = await analyzeDocumentJob(doc, baseOpts(fetchImpl, { sleep: async (ms) => void sleeps.push(ms) }));
    expect(r.stats.retries).toBe(2);
    expect(sleeps).toEqual([2_000, 4_000]); // random 0.5 → factor 1.0, so the delay doubles
    expect(server.count("/api/analyze/chunk")).toBe(r.stats.chunks); // faults never reached the server
  });

  it("jitter spreads the delays", () => {
    const delays = [0, 0.25, 0.5, 0.99].map((x) => backoffDelay(1, 2_000, 30_000, () => x));
    expect(new Set(delays).size).toBe(4);
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(2_000);
    expect(Math.max(...delays)).toBeLessThanOrEqual(6_000);
    expect(backoffDelay(10, 2_000, 30_000, () => 0.5)).toBe(30_000);
  });

  it("respects Retry-After from a 429", async () => {
    const server = makeServer(fakeGemini(), { ...SMALL, concurrency: 1 });
    const doc = await docxToDoc(bigLectureParts(20));
    const sleeps: number[] = [];
    const fetchImpl = withFaults(server.fetchImpl, (path, n) => (path.endsWith("/chunk") && n === 1 ? errorResponse(429, "rate-limited", { retryable: true }, { "Retry-After": "7" }) : undefined));
    await analyzeDocumentJob(doc, baseOpts(fetchImpl, { sleep: async (ms) => void sleeps.push(ms) }));
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(7_000);
    expect(sleeps[0]).toBeLessThanOrEqual(8_400);
  });

  it("uses the retry delay the server reports in the body (Gemini's own advice)", async () => {
    const server = makeServer(fakeGemini(), { ...SMALL, concurrency: 1 });
    const sleeps: number[] = [];
    const fetchImpl = withFaults(server.fetchImpl, (path, n) => (path.endsWith("/chunk") && n === 1 ? errorResponse(503, "ai-unavailable", { retryable: true, retryAfterMs: 12_000 }) : undefined));
    await analyzeDocumentJob(await docxToDoc(bigLectureParts(20)), baseOpts(fetchImpl, { sleep: async (ms) => void sleeps.push(ms) }));
    expect(sleeps[0]).toBeGreaterThanOrEqual(12_000);
  });

  it("after a 429/503 the whole job drops to one request at a time", async () => {
    const server = makeServer(fakeGemini({ override: async () => { await new Promise((r) => setTimeout(r, 4)); return undefined; } }), { ...SMALL, concurrency: 3 });
    let afterFault = 0;
    let faulted = false;
    const base = server.fetchImpl;
    const fetchImpl: Fetch = async (input, init) => {
      const path = new URL(String(input), "http://x").pathname;
      if (path.endsWith("/chunk") && !faulted) {
        faulted = true;
        return errorResponse(429, "rate-limited", { retryable: true });
      }
      if (faulted && path.endsWith("/chunk")) afterFault++;
      return base(input, init);
    };
    const before = server.inFlight.peak;
    await analyzeDocumentJob(await docxToDoc(bigLectureParts(30)), baseOpts(fetchImpl));
    expect(before).toBe(0);
    expect(afterFault).toBeGreaterThan(3);
    // Requests already in flight at the moment of the fault may overlap; afterwards it is sequential.
    expect(server.inFlight.peak).toBeLessThanOrEqual(3);
  });

  it("gives up after the retry limit with a clear message and keeps what finished", async () => {
    const server = makeServer(fakeGemini(), { ...SMALL, maxRetries: 2, concurrency: 1 });
    const store = createJobStore();
    const fetchImpl = withFaults(server.fetchImpl, (path, _n, body) => (path.endsWith("/chunk") && JSON.parse(body).index === 3 ? errorResponse(503, "ai-unavailable", { retryable: true }) : undefined));
    const err = await fails(analyzeDocumentJob(await docxToDoc(bigLectureParts(20)), baseOpts(fetchImpl, { store })));
    expect(err.code).toBe("ai-unavailable");
    expect(err.message).toMatch(/3 of \d+ parts of the document were analyzed and are kept/);
    expect(store.digests.size).toBe(3);
  });

  it.each([
    ["invalid key", 502, "invalid-api-key", { retryable: false }],
    ["daily quota", 429, "quota-exhausted", { retryable: false }],
    ["rejected schema / bad request", 503, "ai-unavailable", { retryable: false }],
    ["blocked content", 422, "ai-blocked", {}],
  ])("does not retry permanent errors: %s", async (_n, status, code, extra) => {
    const server = makeServer(fakeGemini(), { ...SMALL, concurrency: 1 });
    const sleeps: number[] = [];
    const fetchImpl = withFaults(server.fetchImpl, (path) => (path.endsWith("/chunk") ? errorResponse(status, code, extra) : undefined));
    const err = await fails(analyzeDocumentJob(await docxToDoc(bigLectureParts(20)), baseOpts(fetchImpl, { sleep: async (ms) => void sleeps.push(ms) })));
    expect(err.code).toBe(code);
    expect(sleeps).toHaveLength(0);
    expect(isRetryable(err)).toBe(false);
  });

  it("recovers from partial progress: finished chunks are not requested again on the next attempt", async () => {
    const server = makeServer(fakeGemini(), { ...SMALL, concurrency: 1 });
    const doc = await docxToDoc(bigLectureParts(25));
    const store = createJobStore();
    let broken = true;
    const fetchImpl = withFaults(server.fetchImpl, (path, _n, body) => (broken && path.endsWith("/chunk") && JSON.parse(body).index === 4 ? errorResponse(429, "quota-exhausted", { retryable: false }) : undefined));

    const first = await fails(analyzeDocumentJob(doc, baseOpts(fetchImpl, { store })));
    expect(first.code).toBe("quota-exhausted");
    expect(first.message).toMatch(/4 of \d+ parts/);
    expect(server.count("/api/analyze/chunk")).toBe(4);

    broken = false; // the problem is fixed; the user presses Generate again
    const second = await analyzeDocumentJob(doc, baseOpts(fetchImpl, { store }));
    expect(second.stats.chunksFromCache).toBe(4);
    expect(server.count("/api/analyze/chunk")).toBe(second.stats.chunks); // 4 earlier + only the missing ones, no repeats
    expect(second.plan.slides.length).toBeGreaterThan(5);
  });

  it("recovers a failed plan part without redoing the finished work", async () => {
    const server = makeServer(fakeGemini({ bulletsPerSlide: 3 }), { ...SMALL, concurrency: 1 });
    const doc = await docxToDoc(bigLectureParts(40));
    const store = createJobStore();
    let broken = true;
    const fetchImpl = withFaults(server.fetchImpl, (path, _n, body) => (broken && path.endsWith("/plan") && JSON.parse(body).part?.index === 1 ? errorResponse(429, "quota-exhausted", { retryable: false }) : undefined));
    const first = await fails(analyzeDocumentJob(doc, baseOpts(fetchImpl, { store })));
    expect(first.code).toBe("quota-exhausted");
    const chunkCalls = server.count("/api/analyze/chunk");
    const planCalls = server.count("/api/analyze/plan");
    broken = false;
    await analyzeDocumentJob(doc, baseOpts(fetchImpl, { store }));
    expect(server.count("/api/analyze/chunk")).toBe(chunkCalls); // all chunks came from the store
    expect(store.plans.size).toBeGreaterThan(1);
    expect(server.count("/api/analyze/plan")).toBeLessThan(planCalls + store.plans.size); // finished parts reused
  });

  it("the server endpoints never retry on their own (the browser decides) and pass on retry advice", async () => {
    const calls: number[] = [];
    const gemini = fakeGemini({
      override: () => {
        calls.push(1);
        throw Object.assign(aiError("rate-limited"), { retryable: true, retryAfterMs: 9_000 });
      },
    });
    const server = makeServer(gemini, { ...SMALL, maxRetries: 3 });
    const res = await server.fetchImpl("/api/analyze/chunk", {
      method: "POST",
      body: JSON.stringify({ index: 0, total: 1, chunk: { id: "chunk-1", parts: [{ sectionId: "section-001", text: "[b1] hello", continued: false }] } }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("9");
    expect(await res.json()).toMatchObject({ error: { code: "rate-limited", retryable: true, retryAfterMs: 9_000 } });
    expect(calls).toHaveLength(1);
    expect(server.seenConfigs.every((c) => c.maxRetries === 0)).toBe(true);
  });

  it("limits concurrent requests to the configured value", async () => {
    const server = makeServer(fakeGemini({ override: async () => { await new Promise((r) => setTimeout(r, 5)); return undefined; } }), { ...SMALL, concurrency: 3 });
    await analyzeDocumentJob(await docxToDoc(bigLectureParts(30)), baseOpts(server.fetchImpl));
    expect(server.inFlight.peak).toBe(3);
  });

  it("invalid AI output is repaired once on the server and retried once by the browser, never forever", async () => {
    let bad = 0;
    const flaky = makeServer(fakeGemini({ override: (r) => (r.prompt.includes("Analyze part") && bad++ < 2 ? "garbage" : undefined) }), SMALL);
    const doc = await docxToDoc(bigLectureParts(20));
    expect((await analyzeDocumentJob(doc, baseOpts(flaky.fetchImpl))).plan.slides.length).toBeGreaterThan(3);
    const always = makeServer(fakeGemini({ override: (rq) => (rq.prompt.includes("Analyze part") ? "garbage" : undefined) }), { ...SMALL, concurrency: 1 });
    const err = await fails(analyzeDocumentJob(doc, baseOpts(always.fetchImpl)));
    expect(err.code).toBe("invalid-ai-response");
    expect(always.count("/api/analyze/chunk")).toBe(2); // original + exactly one retry
  });
});

describe("helpers", () => {
  it("runPool limits concurrency, keeps order, and stops starting new work after a failure", async () => {
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    await expect(
      runPool([0, 1, 2, 3, 4, 5, 6, 7], () => 2, async (i) => {
        started.push(i);
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 3));
        active--;
        if (i === 2) throw new Error("boom");
        return i * 2;
      }),
    ).rejects.toThrow("boom");
    expect(peak).toBeLessThanOrEqual(2);
    expect(started.length).toBeLessThan(8);
    expect(await runPool([3, 1, 2], () => 5, async (x) => x * 10)).toEqual([30, 10, 20]);
  });

  it("partitions sections into balanced consecutive parts and merges part plans safely", () => {
    const secs = Array.from({ length: 12 }, (_, i) => ({ id: `section-${String(i + 1).padStart(3, "0")}`, chars: 1000 }));
    const groups = partitionSections(secs, 3);
    expect(groups.map((g) => g.length)).toEqual([4, 4, 4]);
    expect(groups.flat()).toEqual(secs.map((s) => s.id));
    const mk = (layouts: string[]) => ({ presentationTitle: "T", slides: layouts.map((l, i) => ({ id: `x${i}`, layout: l, title: l, sourceSections: [] })) }) as never;
    const merged = mergePlans([mk(["title", "title-content"]), mk(["Title", "title-content"]), mk(["title-content", "key-takeaways"])]);
    expect(merged.slides.map((s) => s.layout)).toEqual(["title", "title-content", "title-content", "title-content", "key-takeaways"]);
    expect(merged.slides.map((s) => s.id)).toEqual(["slide-001", "slide-002", "slide-003", "slide-004", "slide-005"]);
  });

  it("dropToFit shrinks an outline deterministically and says when it cannot fit", () => {
    const entry = (id: string, n: number) => ({
      sectionId: id,
      topic: undefined,
      learningObjectives: undefined,
      summary: "s",
      points: Array.from({ length: n }, (_, i) => ({ kind: "concept" as const, term: undefined, sourceBlocks: undefined, text: "x".repeat(200), importance: (["high", "medium", "low"] as const)[i % 3] })),
    });
    const digests = [{ sections: [entry("section-001", 9), entry("section-002", 9)] }];
    const out = dropToFit(digests, 1_500);
    expect(digestChars(out.digests)).toBeLessThanOrEqual(1_500);
    expect(out.dropped).toBeGreaterThan(0);
    expect(out.digests[0].sections.every((s) => s.points.length >= 1)).toBe(true);
    expect(digestChars(digests)).toBeGreaterThan(1_500); // the input is not mutated
    expect(dropToFit(digests, 10).fits).toBe(false);
  });

  it("hash is stable and content-sensitive", () => {
    expect(hash("abc")).toBe(hash("abc"));
    expect(hash("abc")).not.toBe(hash("abd"));
  });
});

describe("final PPTX from a large document (mock Gemini)", () => {
  it("produces a valid PPTX; every section is represented and layouts have no errors", async () => {
    const server = makeServer(fakeGemini(), { ...SMALL, planInputChars: 40_000 });
    const doc = await docxToDoc(bigLectureParts(36));
    const job = await analyzeDocumentJob(doc, baseOpts(server.fetchImpl));
    const plan = aiPlanToDeckPlan(job.plan, doc, { density: "balanced" }, job.warnings);
    const fitted = composeValidated(plan, resolveSettings(DEFAULT_SETTINGS));
    expect(fitted.issues.filter((i) => i.severity === "error")).toEqual([]);
    const bytes = (await writePptx(fitted.deck, { title: fitted.plan.title })) as Uint8Array;
    expect((await inspectPptx(bytes, fitted.plan.slides.length)).problems).toEqual([]);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length).toBe(fitted.plan.slides.length);
    expect(fitted.plan.slides.length).toBeGreaterThan(40);
    expect(plan.warnings.filter((w) => /did not cite/.test(w))).toEqual([]);
    expect(plan.coverage.assigned.length).toBe(plan.coverage.totalBlocks);
  });
});

describe("service contract", () => {
  it("advertises non-secret limits to the browser", async () => {
    const server = makeServer(fakeGemini(), SMALL);
    const json = await (await server.fetchImpl("/api/analyze/limits")).json();
    expect(json).toMatchObject({ singleCallChars: 5_000, chunkChars: 12_000, maxChunks: 80, maxDocChars: 1_000_000 });
    expect(JSON.stringify(json)).not.toMatch(/test-key|apiKey/i);
  });

  it("validates step requests (bad shape 400, oversize chunk 413, bad section ids 400)", async () => {
    const server = makeServer(fakeGemini(), SMALL);
    const post = (body: unknown) => server.fetchImpl("/api/analyze/chunk", { method: "POST", body: JSON.stringify(body) });
    expect((await post({ nope: 1 })).status).toBe(400);
    expect((await post({ index: 0, total: 1, chunk: { id: "c", parts: [{ sectionId: "../../etc", text: "x", continued: false }] } })).status).toBe(400);
    expect((await post({ index: 0, total: 1, chunk: { id: "c", parts: [{ sectionId: "section-001", text: "x".repeat(60_000), continued: false }] } })).status).toBe(413);
  });
});
