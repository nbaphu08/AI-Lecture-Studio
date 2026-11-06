// @vitest-environment node
import { describe, expect, it } from "vitest";
import { dropEmptySlides, extractNumbers, validatePlan, type ValidationContext } from "@/lib/ai/plan-validation";

const ctx: ValidationContext = {
  sectionIds: new Set(["section-001", "section-002"]),
  tableIds: new Set(["b5"]),
  imageIds: new Set(["b9"]),
  sourceText: "[b1] Sales were 120 in Q1, 150 in Q2 and 1,200 in total. Growth 12.5% by 2024.",
};

const slide = (o: Record<string, unknown> = {}) => ({
  id: "slide-001",
  layout: "title-content",
  title: "Sales",
  content: [{ text: "Sales were 120 in Q1", importance: "high" }],
  sourceSections: ["section-001"],
  ...o,
});
const plan = (slides: unknown[], o: Record<string, unknown> = {}) => JSON.stringify({ presentationTitle: "Deck", slides, ...o });

describe("validatePlan", () => {
  it("accepts a valid plan", () => {
    const r = validatePlan(plan([slide()]), ctx);
    expect(r.problems).toEqual([]);
    expect(r.plan?.slides[0].content?.[0].text).toBe("Sales were 120 in Q1");
  });

  it("accepts JSON wrapped in a code fence and null for optional fields", () => {
    const raw = "```json\n" + plan([slide({ keyMessage: null, speakerNotes: null, chart: null })]) + "\n```";
    const r = validatePlan(raw, ctx);
    expect(r.problems).toEqual([]);
    expect(r.plan?.slides[0].keyMessage).toBeUndefined();
  });

  it("rejects text that is not JSON", () => {
    expect(validatePlan("Sure! Here are your slides:", ctx).problems[0]).toMatch(/not valid JSON/);
  });

  it("rejects structurally invalid plans with readable problems", () => {
    const r = validatePlan(JSON.stringify({ presentationTitle: "x", slides: [{ id: "a", layout: "title-content" }] }), ctx);
    expect(r.plan).toBeUndefined();
    expect(r.problems.join(" ")).toContain("slides.0.title");
    expect(validatePlan(JSON.stringify({ slides: [] }), ctx).plan).toBeUndefined();
  });

  it("makes duplicate slide ids unique", () => {
    const r = validatePlan(plan([slide(), slide({ title: "Second" })]), ctx);
    const ids = r.plan!.slides.map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("removes references to sections that do not exist", () => {
    const r = validatePlan(plan([slide({ sourceSections: ["section-001", "section-099"] })]), ctx);
    expect(r.plan!.slides[0].sourceSections).toEqual(["section-001"]);
    expect(r.warnings.join(" ")).toMatch(/do not exist/);
  });

  it("removes references to tables and images that do not exist", () => {
    const r = validatePlan(plan([slide({ tableRef: "b77", imageRef: "b9" })]), ctx);
    expect(r.plan!.slides[0].tableRef).toBeUndefined();
    expect(r.plan!.slides[0].imageRef).toBe("b9");
  });

  it("keeps an unknown layout name (the design engine maps it) but flags slides without content", () => {
    expect(validatePlan(plan([slide({ layout: "fancy-hero" })]), ctx).problems).toEqual([]);
    const r = validatePlan(plan([slide(), slide({ id: "slide-002", content: [], title: "Empty" })]), ctx);
    expect(r.problems.join(" ")).toContain("Empty");
    expect(dropEmptySlides(r.plan!).plan.slides).toHaveLength(1);
  });

  it("drops charts whose numbers are not in the source", () => {
    const bad = { chartType: "bar", categories: ["Q1", "Q2"], series: [{ name: "Sales", values: [120, 999] }] };
    const r = validatePlan(plan([slide({ layout: "chart", chart: bad })]), ctx);
    expect(r.plan!.slides[0].chart).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/not in the source/);
  });

  it("keeps grounded charts, including numbers written with thousands separators", () => {
    const good = { chartType: "line", categories: ["Q1", "Q2", "Total"], series: [{ name: "Sales", values: [120, 150, 1200] }] };
    expect(validatePlan(plan([slide({ layout: "chart", chart: good })]), ctx).plan!.slides[0].chart).toBeDefined();
  });

  it("drops charts with inconsistent data", () => {
    const bad = { chartType: "bar", categories: ["Q1", "Q2", "Q3"], series: [{ name: "Sales", values: [120, 150] }] };
    expect(validatePlan(plan([slide({ layout: "chart", chart: bad })]), ctx).plan!.slides[0].chart).toBeUndefined();
  });

  it("warns about numbers in slide text that the source does not contain", () => {
    const r = validatePlan(plan([slide({ content: [{ text: "Sales grew 38.2% in 2031", importance: "high" }] })]), ctx);
    expect(r.warnings.join(" ")).toMatch(/38\.2/);
    const ok = validatePlan(plan([slide({ content: [{ text: "Growth was 12.5% by 2024", importance: "high" }] })]), ctx);
    expect(ok.warnings).toEqual([]);
  });
});

describe("extractNumbers", () => {
  it("normalizes separators and ignores block tags", () => {
    expect(extractNumbers("[b12] Total 1,200 and 3.5 in 2024.")).toEqual(["1200", "3.5", "2024"]);
  });
});
