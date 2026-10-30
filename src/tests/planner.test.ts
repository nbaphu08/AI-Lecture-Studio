import { describe, expect, it } from "vitest";
import type { DocumentBlock, ParsedDocument } from "@/lib/docx/types";
import { planSlides } from "@/lib/slides/planner";
import { splitSentences, extractLeadingDate } from "@/lib/slides/content-analysis";
import type { Slide } from "@/lib/slides/types";

type Draft = DocumentBlock extends infer B ? (B extends unknown ? Omit<B, "id"> : never) : never;
const doc = (blocks: Draft[], title?: string): ParsedDocument => ({
  title,
  blocks: blocks.map((b, i) => ({ ...b, id: `b${i}` }) as DocumentBlock),
  warnings: [],
});
const kinds = (slides: Slide[]) => slides.map((s) => s.kind);
const h = (level: 1 | 2 | 3, text: string): Draft => ({ type: "heading", level, text });
const p = (text: string): Draft => ({ type: "paragraph", text });

describe("content analysis", () => {
  it("splits sentences without breaking abbreviations", () => {
    expect(splitSentences("Dr. Smith arrived. He sat down, e.g. on a chair. Done!")).toEqual([
      "Dr. Smith arrived.",
      "He sat down, e.g. on a chair.",
      "Done!",
    ]);
  });

  it("extracts leading dates", () => {
    expect(extractLeadingDate("1998: Google is founded.")).toEqual({ date: "1998", text: "Google is founded." });
    expect(extractLeadingDate("In March 2011, the plant was damaged.")).toEqual({ date: "March 2011", text: "the plant was damaged." });
    expect(extractLeadingDate("There were 2000 people.")).toBeNull();
  });
});

describe("planSlides", () => {
  it("creates a cover from the title and subtitle", () => {
    const plan = planSlides(doc([{ type: "title", text: "My Talk" }, { type: "paragraph", text: "A short subtitle", subtitle: true }, p("Body text.")]), { density: "balanced" });
    expect(plan.slides[0]).toMatchObject({ kind: "cover", title: "My Talk", subtitle: "A short subtitle" });
    expect(plan.title).toBe("My Talk");
  });

  it("uses a single leading Heading 1 as the title and falls back to the file name otherwise", () => {
    const single = planSlides(doc([h(1, "Photosynthesis"), h(2, "Light reactions"), p("They happen in the thylakoids. They need light.")]), { density: "balanced" });
    expect(single.title).toBe("Photosynthesis");
    expect(single.slides.filter((s) => s.kind === "section")).toHaveLength(0);

    const none = planSlides(doc([p("Just text.")]), { density: "balanced", fileName: "week_3-notes.docx" });
    expect(none.title).toBe("Week 3 notes");
  });

  it("adds section dividers for documents with several top-level sections", () => {
    const plan = planSlides(
      doc([{ type: "title", text: "T" }, h(1, "One"), p("Alpha text here."), h(1, "Two"), p("Beta text here."), h(1, "Three"), p("Gamma text here.")]),
      { density: "balanced" },
    );
    expect(kinds(plan.slides).filter((k) => k === "section")).toHaveLength(3);
    const sectionSlides = plan.slides.filter((s) => s.kind === "section");
    expect(sectionSlides.map((s) => (s.kind === "section" ? s.number : 0))).toEqual([1, 2, 3]);
    expect(plan.slides.at(-1)?.section).toBe("Three");
  });

  it("detects a definition from heading + short explanation", () => {
    const plan = planSlides(doc([{ type: "title", text: "T" }, h(2, "Osmosis"), p("Osmosis is the movement of water across a semi-permeable membrane.")]), { density: "balanced" });
    expect(plan.slides[1]).toMatchObject({ kind: "definition", term: "Osmosis" });
  });

  it("turns ordered lists of steps into a process", () => {
    const plan = planSlides(doc([{ type: "title", text: "T" }, h(2, "Method"), { type: "list", ordered: true, items: ["Mix", "Heat", "Cool", "Serve"] }]), { density: "balanced" });
    expect(plan.slides[1]).toMatchObject({ kind: "process", steps: ["Mix", "Heat", "Cool", "Serve"], startAt: 1 });
  });

  it("splits long processes and keeps numbering continuous", () => {
    const items = Array.from({ length: 8 }, (_, i) => `Step text ${i + 1}`);
    const plan = planSlides(doc([{ type: "title", text: "T" }, { type: "list", ordered: true, items }]), { density: "balanced" });
    const processes = plan.slides.filter((s) => s.kind === "process");
    expect(processes.map((s) => (s.kind === "process" ? s.startAt : 0))).toEqual([1, 6]);
  });

  it("builds timelines from dated paragraphs", () => {
    const plan = planSlides(
      doc([{ type: "title", text: "T" }, h(2, "History"), p("1969: Moon landing."), p("1990: Hubble launched."), p("2021: Webb launched.")]),
      { density: "balanced" },
    );
    expect(plan.slides[1]).toMatchObject({ kind: "timeline", events: [{ date: "1969" }, { date: "1990" }, { date: "2021" }] });
  });

  it("builds comparisons from 'vs' headings with two subsections and from contrast paragraphs", () => {
    const plan = planSlides(
      doc([
        { type: "title", text: "T" },
        h(2, "Mitosis vs Meiosis"),
        h(3, "Mitosis"),
        { type: "list", ordered: false, items: ["Two daughter cells", "Identical"] },
        h(3, "Meiosis"),
        { type: "list", ordered: false, items: ["Four daughter cells", "Varied"] },
        h(2, "Approaches"),
        p("Lectures are efficient for large groups. In contrast, seminars encourage discussion."),
      ]),
      { density: "balanced" },
    );
    expect(plan.slides[1]).toMatchObject({ kind: "comparison", left: { heading: "Mitosis" }, right: { heading: "Meiosis" } });
    expect(plan.slides[2]).toMatchObject({ kind: "comparison", right: { items: ["In contrast, seminars encourage discussion."] } });
  });

  it("paginates tables and repeats the header", () => {
    const rows = Array.from({ length: 12 }, (_, i) => [`r${i}`, `${i}`]);
    const plan = planSlides(doc([{ type: "title", text: "T" }, { type: "table", headers: ["Name", "N"], rows }]), { density: "balanced" });
    const tables = plan.slides.filter((s) => s.kind === "table");
    expect(tables).toHaveLength(2);
    tables.forEach((t) => expect(t.kind === "table" && t.headers).toEqual(["Name", "N"]));
    expect(tables[1].kind === "table" && tables[1].title).toContain("(cont.)");
  });

  it("pairs images with nearby text", () => {
    const plan = planSlides(doc([{ type: "title", text: "T" }, h(2, "Figure"), { type: "image", src: "data:image/png;base64,AA" }, p("This shows the setup.")]), { density: "balanced" });
    expect(plan.slides[1]).toMatchObject({ kind: "imageText", paragraphs: ["This shows the setup."] });
  });

  it("uses the conclusion layout for summary sections", () => {
    const plan = planSlides(doc([{ type: "title", text: "T" }, h(1, "Conclusion"), p("First point here. Second point here.")]), { density: "balanced" });
    expect(plan.slides.at(-1)).toMatchObject({ kind: "conclusion", points: ["First point here.", "Second point here."] });
  });

  it("splits very long paragraphs at sentence boundaries across slides", () => {
    const sentence = "This sentence is part of a very long paragraph about an important topic.";
    const long = Array.from({ length: 40 }, () => sentence).join(" ");
    for (const density of ["concise", "balanced", "detailed"] as const) {
      const plan = planSlides(doc([{ type: "title", text: "T" }, h(2, "Long"), p(long)]), { density });
      const body = plan.slides.slice(1);
      expect(body.length).toBeGreaterThan(1);
      for (const s of body) {
        const texts = s.kind === "bullets" ? s.bullets : s.kind === "content" ? s.paragraphs : [];
        texts.forEach((t) => expect(t.endsWith(".")).toBe(true));
      }
    }
    const concise = planSlides(doc([{ type: "title", text: "T" }, p(long)]), { density: "concise" }).slides.length;
    const detailed = planSlides(doc([{ type: "title", text: "T" }, p(long)]), { density: "detailed" }).slides.length;
    expect(concise).toBeGreaterThan(detailed);
  });

  it("handles documents containing only images", () => {
    const plan = planSlides(doc([{ type: "image", src: "data:image/png;base64,AA" }, { type: "image", src: "data:image/png;base64,BB" }]), { density: "balanced", fileName: "photos.docx" });
    expect(kinds(plan.slides)).toEqual(["cover", "imageText", "imageText"]);
  });

  it("reports unsupported blocks instead of silently dropping them", () => {
    const plan = planSlides(doc([p("Hello there."), { type: "unsupported", reason: "Embedded chart" }]), { density: "balanced" });
    expect(plan.coverage.unsupported).toEqual([{ id: "b1", reason: "Embedded chart" }]);
  });
});
