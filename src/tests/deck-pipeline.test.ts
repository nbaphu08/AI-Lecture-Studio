// @vitest-environment node
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { analyzeDocumentJob, createJobStore } from "@/lib/analysis-job";
import { planSchema } from "@/lib/ai/schemas";
import type { ParsedDocument } from "@/lib/docx/types";
import { resolveSettings } from "@/lib/design/style-hints";
import { THEME_LIST, type ThemeId } from "@/lib/design/themes";
import type { AspectRatio } from "@/lib/design/tokens";
import { composeDeck } from "@/lib/pptx/compose";
import type { ComposedDeck } from "@/lib/pptx/draw";
import { writePptx } from "@/lib/pptx/generate";
import { inspectPptx } from "@/lib/pptx/pptx-utils";
import { composeValidated, issueWarnings, validateDeck } from "@/lib/pptx/slide-validator";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { aiPlanToDeckPlan } from "@/lib/slides/ai-plan";
import type { DeckPlan } from "@/lib/slides/types";
import { fakeGemini } from "./fake-gemini";
import { makeServer } from "./harness";
import { h, longLecture, makeDoc, numericDoc, p, repeatedDoc, shortLecture, tableDoc, technicalDoc } from "./fixtures";

const { window } = new JSDOM("");
async function run(doc: ParsedDocument, density: "concise" | "balanced" | "detailed" = "balanced") {
  // The same path the browser takes: limits → (chunks → consolidation) → plan, against the real handlers.
  const server = makeServer(fakeGemini());
  const job = await analyzeDocumentJob(doc, { density, preferDiagrams: false, store: createJobStore(), fetchImpl: server.fetchImpl as typeof fetch, onProgress: () => {}, sleep: async () => {} });
  return aiPlanToDeckPlan(job.plan, doc, { density }, job.warnings);
}

async function pptxOf(plan: DeckPlan, themeId: ThemeId = "academic", aspect: AspectRatio = "16:9") {
  const settings = resolveSettings({ ...DEFAULT_SETTINGS, themeId, aspect });
  const fitted = composeValidated(plan, settings);
  const bytes = (await writePptx(fitted.deck, { title: fitted.plan.title })) as Uint8Array;
  return { fitted, bytes, zip: await JSZip.loadAsync(bytes) };
}

const slideXml = async (zip: JSZip) =>
  (await Promise.all(Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).map((f) => zip.file(f)!.async("string")))).join("\n");

describe("six kinds of source documents become valid, faithful presentations", () => {
  const scenarios: [string, () => ParsedDocument, string[]][] = [
    ["short lecture", shortLecture, ["chloroplasts", "Calvin cycle", "glucose and oxygen"]],
    ["document with tables", tableDoc, ["Earth is the only planet known to support life"]],
    ["numerical data", numericDoc, ["120 in Q1", "12.5% growth", "3,400 per unit"]],
    ["long technical explanation", technicalDoc, ["slow start threshold (ssthresh)", "fast retransmit"]],
    ["repeated information", repeatedDoc, ["Recycling reduces waste"]],
    ["long multi-chapter lecture", () => longLecture(25), ["Chapter 1: Period 1", "Chapter 25: Period 25"]],
  ];

  it.each(scenarios)("%s", async (_name, make, mustContain) => {
    const doc = make();
    const plan = await run(doc);
    const { fitted, bytes, zip } = await pptxOf(plan);

    // Valid, openable package with one slide per planned slide.
    const inspection = await inspectPptx(bytes, fitted.plan.slides.length);
    expect(inspection.problems).toEqual([]);

    // Layouts stay on the slide and text fits (nothing left to flag as an error).
    expect(fitted.issues.filter((i) => i.severity === "error")).toEqual([]);

    // Source facts survive in editable text.
    const xml = await slideXml(zip);
    for (const phrase of mustContain) expect(xml.replace(/&amp;/g, "&")).toContain(phrase.replace(/&/g, "&"));

    // Native text, not pictures.
    expect(xml).toContain("<a:t>");
    expect(Object.keys(zip.files).filter((f) => /^ppt\/media\/.+/.test(f))).toHaveLength(0);
    const parser = new window.DOMParser();
    expect(parser.parseFromString(xml.split("</p:sld>")[0] + "</p:sld>", "application/xml").getElementsByTagName("parsererror")).toHaveLength(0);
  });

  it("keeps every cited section represented for the long document", async () => {
    const plan = await run(longLecture(25));
    expect(plan.warnings.filter((w) => /did not cite/.test(w))).toEqual([]);
    expect(plan.coverage.assigned.length).toBe(plan.coverage.totalBlocks);
  });
});

describe("rich AI plan: charts, tables, quiz, notes, images in every theme and ratio", () => {
  const doc = makeDoc([
    { type: "title", text: "Sales" },
    h(1, "Results"),
    p("Sales were 120, 150, 180 and 210."),
    { type: "table", headers: ["Quarter", "Sales"], rows: [["Q1", "120"], ["Q2", "150"]] },
    { type: "image", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", alt: "Pixel", width: 1, height: 1 },
  ]);
  const ai = planSchema.parse({
    presentationTitle: "Sales",
    subtitle: "Review",
    slides: [
      { id: "a", layout: "title", title: "Sales", sourceSections: ["section-001"] },
      { id: "b", layout: "chart", title: "Sales by quarter", keyMessage: "Sales grew every quarter.", chart: { chartType: "bar", categories: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "Sales", values: [120, 150, 180, 210] }] }, speakerNotes: "Walk through the quarters.", sourceSections: ["section-002"] },
      { id: "c", layout: "chart", title: "Share", chart: { chartType: "pie", categories: ["Q1", "Q2"], series: [{ name: "Sales", values: [120, 150] }] }, sourceSections: ["section-002"] },
      { id: "d", layout: "chart", title: "Trend", chart: { chartType: "line", categories: ["Q1", "Q2", "Q3"], series: [{ name: "Sales", values: [120, 150, 180] }, { name: "Plan", values: [120, 150, 180] }] }, sourceSections: ["section-002"] },
      { id: "e", layout: "table", title: "Quarterly table", tableRef: "b3", sourceSections: ["section-002"] },
      { id: "f", layout: "text-image", title: "Figure", imageRef: "b4", content: [{ text: "A single pixel.", importance: "high" }], sourceSections: ["section-002"] },
      { id: "g", layout: "quiz", title: "Discuss", questions: ["Why did sales grow?", "What could slow growth?", "Which quarter was strongest?", "What would you change?", "How would you check?"], sourceSections: ["section-002"] },
      { id: "h", layout: "key-takeaways", title: "Takeaways", content: [{ text: "Sales grew.", importance: "high" }], sourceSections: ["section-002"] },
    ],
  });

  it("renders for all themes and both aspect ratios with native charts, notes and no layout errors", async () => {
    const plan = aiPlanToDeckPlan(ai, doc, { density: "balanced" });
    expect(plan.slides.map((s) => s.kind)).toEqual(["cover", "chart", "chart", "chart", "table", "imageText", "quiz", "quiz", "conclusion"]);
    for (const theme of THEME_LIST) {
      for (const aspect of ["16:9", "4:3"] as const) {
        const { fitted, bytes, zip } = await pptxOf(plan, theme.id, aspect);
        expect(fitted.issues.filter((i) => i.severity === "error"), `${theme.id} ${aspect}`).toEqual([]);
        expect((await inspectPptx(bytes, plan.slides.length)).problems).toEqual([]);
        const files = Object.keys(zip.files);
        expect(files.filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(3);
        expect(files.some((f) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f))).toBe(true);
        const notes = (await Promise.all(files.filter((f) => /notesSlide\d+\.xml$/.test(f)).map((f) => zip.file(f)!.async("string")))).join(" ");
        expect(notes).toContain("Walk through the quarters.");
        const xml = await slideXml(zip);
        expect(xml).toContain("<a:tbl>");
        expect(xml).toContain("Why did sales grow?");
      }
    }
  });

  it("preserves the chart numbers in the editable chart data", async () => {
    const { zip } = await pptxOf(aiPlanToDeckPlan(ai, doc, { density: "balanced" }));
    // (PptxGenJS numbers chart parts with a process-wide counter, so look them up by pattern.)
    const names = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
    const xmls = await Promise.all(names.map((f) => zip.file(f)!.async("string")));
    const bar = xmls.find((x) => x.includes("<c:barChart>"))!;
    for (const v of ["120", "150", "180", "210"]) expect(bar).toContain(`<c:v>${v}</c:v>`);
    expect(xmls.some((x) => x.includes("<c:pieChart>"))).toBe(true);
    expect(xmls.some((x) => x.includes("<c:lineChart>"))).toBe(true);
  });
});

describe("layout validation", () => {
  const settings = resolveSettings(DEFAULT_SETTINGS);

  it("finds overflow, out-of-bounds shapes, missing titles, empty slides and overlaps", () => {
    const deck: ComposedDeck = {
      w: 13.333,
      h: 7.5,
      slides: [
        { background: "FFFFFF", title: "", shapes: [{ t: "text", x: 1, y: 1, w: 3, h: 0.4, paras: [{ text: "word ".repeat(200) }], size: 20, color: "000000", font: "Calibri" }] },
        { background: "FFFFFF", title: "Empty", shapes: [{ t: "rect", x: 0, y: 0, w: 1, h: 1, fill: "FF0000" }] },
        { background: "FFFFFF", title: "Out", shapes: [{ t: "text", x: 12, y: 1, w: 3, h: 1, paras: [{ text: "hi" }], size: 20, color: "000000", font: "Calibri" }] },
        {
          background: "FFFFFF",
          title: "Overlap",
          shapes: [
            { t: "text", x: 1, y: 1, w: 3, h: 1, paras: [{ text: "one" }], size: 20, color: "000000", font: "Calibri" },
            { t: "text", x: 1.2, y: 1.1, w: 3, h: 1, paras: [{ text: "two" }], size: 20, color: "000000", font: "Calibri" },
          ],
        },
      ],
    };
    const codes = (i: number) => validateDeck(deck).filter((x) => x.slide === i).map((x) => x.code);
    expect(codes(0)).toEqual(expect.arrayContaining(["missing-title", "overflow"]));
    expect(codes(1)).toContain("empty-slide");
    expect(codes(2)).toContain("out-of-bounds");
    expect(codes(3)).toContain("overlap");
    expect(validateDeck({ ...deck, w: 0 }).some((x) => x.code === "invalid-size")).toBe(true);
  });

  it("does not flag decorative quote marks as overflowing text", () => {
    const plan: DeckPlan = {
      title: "T",
      slides: [
        { id: "s1", kind: "cover", title: "T", sourceIds: [] },
        { id: "s2", kind: "definition", title: "Osmosis", term: "Osmosis", definition: "Movement of water across a membrane.", sourceIds: [] },
      ],
      coverage: { totalBlocks: 0, assigned: [], metadata: [], unsupported: [], recovered: [] },
      warnings: [],
    };
    for (const theme of THEME_LIST) {
      const fitted = composeValidated(plan, resolveSettings({ ...DEFAULT_SETTINGS, themeId: theme.id }));
      expect(fitted.issues.filter((i) => i.code === "overflow"), theme.id).toEqual([]);
    }
  });

  it("splits overloaded slides instead of shrinking text below a readable size", () => {
    const bullets = Array.from({ length: 6 }, (_, i) => `Bullet ${i} ` + "with a quite long explanation that keeps going and going ".repeat(4));
    const plan: DeckPlan = {
      title: "Dense",
      slides: [
        { id: "s1", kind: "cover", title: "Dense", sourceIds: [] },
        { id: "s2", kind: "bullets", title: "Too much", bullets, sourceIds: [] },
      ],
      coverage: { totalBlocks: 0, assigned: [], metadata: [], unsupported: [], recovered: [] },
      warnings: [],
    };
    const fitted = composeValidated(plan, settings);
    expect(fitted.splits).toBeGreaterThan(0);
    expect(fitted.plan.slides.length).toBeGreaterThan(2);
    expect(fitted.issues.filter((i) => i.code === "overflow")).toEqual([]);
    // No source text was lost by splitting.
    const all = fitted.plan.slides.flatMap((s) => (s.kind === "bullets" ? s.bullets : []));
    expect(all).toEqual(bullets);
    // And the font stayed readable.
    for (const s of fitted.deck.slides) for (const sh of s.shapes) if (sh.t === "text" && sh.paras.some((x) => x.text.length > 40)) expect(Math.min(sh.size, ...sh.paras.map((x) => x.size ?? sh.size))).toBeGreaterThanOrEqual(11);
  });

  it("reports what it cannot fix in plain language", () => {
    const plan: DeckPlan = { title: "T", slides: [{ id: "s1", kind: "cover", title: "Cover", sourceIds: [] }], coverage: { totalBlocks: 0, assigned: [], metadata: [], unsupported: [], recovered: [] }, warnings: [] };
    const out = issueWarnings(plan, [{ slide: 0, code: "overflow", severity: "error", message: "The text is too long for its box." }]);
    expect(out[0]).toMatch(/Slide 1 .*Cover.*too long/);
    expect(composeDeck(plan, settings).slides).toHaveLength(1);
  });
});

describe("inspectPptx", () => {
  it("rejects files that are not PowerPoint packages or have the wrong slide count", async () => {
    expect((await inspectPptx(new Uint8Array([1, 2, 3]), 1)).ok).toBe(false);
    const plan = await run(shortLecture());
    const { bytes, fitted } = await pptxOf(plan);
    expect((await inspectPptx(bytes, fitted.plan.slides.length + 1)).ok).toBe(false);
  });
});
