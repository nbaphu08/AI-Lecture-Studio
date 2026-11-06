// @vitest-environment node
import { describe, expect, it } from "vitest";
import { planSchema, type AiPlan } from "@/lib/ai/schemas";
import { aiPlanToDeckPlan, resolveLayout } from "@/lib/slides/ai-plan";
import { splitSlide } from "@/lib/slides/split";
import type { Slide } from "@/lib/slides/types";
import { h, makeDoc, p, shortLecture, table, tableDoc } from "./fixtures";

const plan = (slides: Record<string, unknown>[], extra: Record<string, unknown> = {}): AiPlan =>
  planSchema.parse({
    presentationTitle: "Deck",
    slides: slides.map((s, i) => ({ id: `slide-${i + 1}`, sourceSections: [], layout: "title-content", title: `Slide ${i + 1}`, ...s })),
    ...extra,
  });
const items = (...texts: string[]) => texts.map((text) => ({ text, importance: "high" }));
const doc = shortLecture();
const opts = { density: "balanced" } as const;
const kinds = (slides: Slide[]) => slides.map((s) => s.kind);

describe("layout mapping", () => {
  it("maps each AI layout to a renderer layout", () => {
    const deck = aiPlanToDeckPlan(
      plan([
        { layout: "title", title: "Deck" },
        { layout: "section-divider", title: "Part one" },
        { layout: "title-content", content: items("a", "b", "c") },
        { layout: "definition", term: "Osmosis", definition: "Movement of water." },
        { layout: "two-column", columns: [{ heading: "A", items: ["1", "2"] }, { heading: "B", items: ["3", "4"] }] },
        { layout: "comparison", columns: [{ heading: "A", items: ["1"] }, { heading: "B", items: ["2"] }] },
        { layout: "process", steps: ["One", "Two", "Three"] },
        { layout: "timeline", events: [{ date: "1990", text: "Start" }, { date: "2000", text: "Growth" }] },
        { layout: "chart", chart: { chartType: "bar", categories: ["A", "B"], series: [{ name: "S", values: [1, 2] }] } },
        { layout: "table", table: { headers: ["A"], rows: [["1"], ["2"]] } },
        { layout: "key-takeaways", content: items("x", "y") },
        { layout: "quiz", questions: ["Why?", "How?"] },
      ]),
      doc,
      opts,
    );
    expect(kinds(deck.slides)).toEqual(["cover", "section", "bullets", "definition", "twoColumn", "comparison", "process", "timeline", "chart", "table", "conclusion", "quiz"]);
  });

  it("falls back for unsupported layouts by inferring from content", () => {
    const s = (o: object) => plan([{ layout: "wild-new-layout", ...o }]).slides[0];
    expect(resolveLayout(s({ steps: ["a", "b"] }))).toBe("process");
    expect(resolveLayout(s({ chart: { chartType: "pie", categories: ["a", "b"], series: [{ name: "x", values: [1, 2] }] } }))).toBe("chart");
    expect(resolveLayout(s({ content: items("a") }))).toBe("title-content");
    expect(resolveLayout(plan([{ layout: "Two Columns" }]).slides[0])).toBe("two-column");
  });

  it("uses a plain content layout when the chosen one cannot hold the content", () => {
    const deck = aiPlanToDeckPlan(plan([{ layout: "process", steps: ["Only one"] }, { layout: "definition", term: "Only a term", content: items("Fallback text") }]), doc, opts);
    expect(kinds(deck.slides)).toEqual(["cover", "bullets", "bullets"]);
    expect(deck.warnings.join(" ")).toMatch(/could not be used/);
  });

  it("leaves out slides that have nothing to show and says so", () => {
    const deck = aiPlanToDeckPlan(plan([{ layout: "chart" }, { layout: "title-content", content: items("kept") }]), doc, opts);
    expect(deck.slides.map((s) => s.kind)).toEqual(["cover", "bullets"]);
    expect(deck.warnings.join(" ")).toMatch(/left out/);
  });
});

describe("cover, sections and traceability", () => {
  it("creates a cover when the AI forgot it and numbers section dividers", () => {
    const deck = aiPlanToDeckPlan(plan([{ layout: "section-divider", title: "A" }, { content: items("x") }, { layout: "section-divider", title: "B" }, { content: items("y") }]), doc, opts);
    expect(deck.slides[0]).toMatchObject({ kind: "cover", title: "Deck" });
    const numbers = deck.slides.flatMap((s) => (s.kind === "section" ? [s.number] : []));
    expect(numbers).toEqual([1, 2]);
    expect(deck.slides[2].section).toBe("A");
    expect(deck.slides[4].section).toBe("B");
  });

  it("records the source blocks behind each slide and reports sections nobody cited", () => {
    const deck = aiPlanToDeckPlan(plan([{ content: items("x"), sourceSections: ["section-002"] }]), doc, opts);
    const slide = deck.slides[1];
    expect(slide.sourceIds).toEqual(["b1", "b2"]);
    expect(deck.coverage.assigned).toEqual(["b1", "b2"]);
    expect(deck.warnings.join(" ")).toContain("The two stages");
  });

  it("carries speaker notes to the first slide of a split", () => {
    const many = Array.from({ length: 14 }, (_, i) => `Point number ${i}`);
    const deck = aiPlanToDeckPlan(plan([{ content: items(...many), speakerNotes: "Remember this." }]), doc, opts);
    const bullets = deck.slides.filter((s) => s.kind === "bullets");
    expect(bullets.length).toBeGreaterThan(1);
    expect(bullets[0].notes).toBe("Remember this.");
    expect(bullets[1].notes).toBeUndefined();
    expect(bullets[1].title).toBe("Slide 1 (cont.)");
  });

  it("validates its input again and refuses malformed plans", () => {
    expect(() => aiPlanToDeckPlan({ presentationTitle: "", slides: [] } as unknown as AiPlan, doc, opts)).toThrow();
  });
});

describe("density and splitting", () => {
  const many = Array.from({ length: 12 }, (_, i) => `Point number ${i}`);

  it("splits overloaded slides according to the density setting", () => {
    const count = (density: "concise" | "balanced" | "detailed") =>
      aiPlanToDeckPlan(plan([{ content: items(...many) }]), doc, { density }).slides.filter((s) => s.kind === "bullets").length;
    expect(count("concise")).toBe(3);
    expect(count("balanced")).toBe(2);
    expect(count("detailed")).toBe(2);
  });

  it("keeps essential points in a concise deck and moves the rest to the notes", () => {
    const content = [
      ...Array.from({ length: 3 }, (_, i) => ({ text: `Essential ${i}`, importance: "high" })),
      { text: "Optional detail", importance: "low" },
      { text: "Another optional detail", importance: "low" },
    ];
    const concise = aiPlanToDeckPlan(plan([{ content }]), doc, { density: "concise" }).slides[1];
    expect(concise.kind === "bullets" && concise.bullets).toEqual(["Essential 0", "Essential 1", "Essential 2"]);
    expect(concise.notes).toContain("Optional detail");
    const detailed = aiPlanToDeckPlan(plan([{ content }]), doc, { density: "detailed" }).slides[1];
    expect(detailed.kind === "bullets" && detailed.bullets).toHaveLength(5);
  });

  it("shows one or two long passages as prose instead of bullets", () => {
    const long = "This is a long explanatory sentence about the topic. ".repeat(6);
    expect(aiPlanToDeckPlan(plan([{ content: items(long) }]), doc, opts).slides[1].kind).toBe("content");
  });

  it("splits groups evenly instead of leaving a lone item", () => {
    const six = Array.from({ length: 6 }, (_, i) => `Step ${i + 1}`);
    const sizes = aiPlanToDeckPlan(plan([{ layout: "process", steps: six }]), doc, opts).slides.flatMap((s) => (s.kind === "process" ? [s.steps.length] : []));
    expect(sizes).toEqual([3, 3]);
    const quiz = aiPlanToDeckPlan(plan([{ layout: "quiz", questions: ["a", "b", "c", "d", "e"] }]), doc, opts).slides.flatMap((s) => (s.kind === "quiz" ? [s.prompts.length] : []));
    expect(quiz).toEqual([3, 2]);
  });

  it("paginates long processes with continuous numbering", () => {
    const steps = Array.from({ length: 8 }, (_, i) => `Step ${i + 1}`);
    const processes = aiPlanToDeckPlan(plan([{ layout: "process", steps }]), doc, opts).slides.filter((s) => s.kind === "process");
    expect(processes.map((s) => (s.kind === "process" ? s.startAt : 0))).toEqual([1, 5]);
  });

  it("draws a flow when the AI describes the content as one", () => {
    const flow = aiPlanToDeckPlan(plan([{ content: items("Collect", "Sort", "Process", "Store"), visualSuggestion: { type: "process diagram" } }]), doc, opts);
    expect(flow.slides[1].kind).toBe("process");
    const plain = aiPlanToDeckPlan(plan([{ content: items("Collect", "Sort", "Process", "Store") }]), doc, opts);
    expect(plain.slides[1].kind).toBe("bullets");
  });
});

describe("content taken from the original document", () => {
  it("copies a referenced table cell for cell instead of trusting retyped values", () => {
    const d = tableDoc();
    const tableId = d.blocks.find((b) => b.type === "table")!.id;
    const deck = aiPlanToDeckPlan(plan([{ layout: "table", tableRef: tableId, table: { rows: [["Mercury", "9999", "7"]] } }]), d, opts);
    const t = deck.slides[1];
    expect(t.kind === "table" && t.rows[0]).toEqual(["Mercury", "4,879", "0"]);
    expect(t.kind === "table" && t.headers).toEqual(["Planet", "Diameter (km)", "Moons"]);
  });

  it("paginates large tables and repeats the header", () => {
    const rows = Array.from({ length: 20 }, (_, i) => [`R${i}`, String(i)]);
    const d = makeDoc([h(1, "Data"), table(["Name", "N"], rows)]);
    const slides = aiPlanToDeckPlan(plan([{ layout: "table", tableRef: "b1" }]), d, opts).slides.filter((s) => s.kind === "table");
    expect(slides).toHaveLength(3);
    expect(slides.every((s) => s.kind === "table" && s.headers?.[0] === "Name")).toBe(true);
    expect(slides.flatMap((s) => (s.kind === "table" ? s.rows : []))).toHaveLength(20);
  });

  it("inserts images only from the source document", () => {
    const d = makeDoc([h(1, "Figure"), { type: "image", src: "data:image/png;base64,AAAA", alt: "Diagram", width: 100, height: 50 }, p("Caption text.")]);
    const deck = aiPlanToDeckPlan(plan([{ layout: "text-image", imageRef: "b1", content: items("Explains the diagram") }]), d, opts);
    const s = deck.slides[1];
    expect(s.kind === "imageText" && s.image).toMatchObject({ src: "data:image/png;base64,AAAA", alt: "Diagram" });
    const none = aiPlanToDeckPlan(plan([{ layout: "text-image", imageRef: "b99", content: items("No such image") }]), d, opts);
    expect(none.slides[1].kind).toBe("bullets");
  });

  it("puts a chart's key message in a caption and keeps accompanying bullets on a follow-up slide", () => {
    const deck = aiPlanToDeckPlan(
      plan([{ layout: "chart", keyMessage: "Sales doubled.", chart: { chartType: "line", categories: ["Q1", "Q2"], series: [{ name: "Sales", values: [120, 240] }] }, content: items("Detail one", "Detail two") }]),
      doc,
      opts,
    );
    expect(kinds(deck.slides)).toEqual(["cover", "chart", "bullets"]);
    expect(deck.slides[1].kind === "chart" && deck.slides[1].caption).toBe("Sales doubled.");
  });
});

describe("splitSlide", () => {
  it("halves splittable slides and leaves the others alone", () => {
    const bullets: Slide = { id: "s", sourceIds: [], kind: "bullets", title: "T", bullets: ["a", "b", "c", "d", "e"] };
    const [a, b] = splitSlide(bullets)!;
    expect(a.kind === "bullets" && a.bullets).toEqual(["a", "b", "c"]);
    expect(b.kind === "bullets" && b.bullets).toEqual(["d", "e"]);
    expect(b.title).toBe("T (cont.)");
    expect(splitSlide({ id: "c", sourceIds: [], kind: "cover", title: "x" })).toBeNull();
    expect(splitSlide({ id: "d", sourceIds: [], kind: "definition", title: "x", term: "t", definition: "d" })).toBeNull();
    const [, again] = splitSlide(b)!;
    expect(again.title).toBe("T (cont.)");
  });
});
