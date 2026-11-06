// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chunkSections, chunkToText } from "@/lib/document/chunker";
import { buildSections } from "@/lib/document/sections";
import { toWireDocument } from "@/lib/document/wire";
import { h, longLecture, makeDoc, p, shortLecture, table, technicalDoc } from "./fixtures";

const sectionsOf = (doc: ReturnType<typeof makeDoc>) => buildSections(toWireDocument(doc).blocks);

describe("sections", () => {
  it("splits at top-level headings with stable ids and keeps the original order", () => {
    const sections = sectionsOf(shortLecture());
    expect(sections.map((s) => s.id)).toEqual(["section-001", "section-002", "section-003", "section-004"]);
    expect(sections.map((s) => s.heading)).toEqual([undefined, "What is photosynthesis?", "The two stages", "Summary"]);
    expect(sections.flatMap((s) => s.blockIds)).toEqual(shortLecture().blocks.map((b) => b.id));
  });

  it("gives identical ids for the same document (browser and server agree)", () => {
    expect(sectionsOf(longLecture(5)).map((s) => s.id)).toEqual(sectionsOf(longLecture(5)).map((s) => s.id));
  });

  it("prefixes each block with its id and keeps table cells", () => {
    const text = sectionsOf(makeDoc([h(1, "T"), table(["A", "B"], [["1", "2"]])]))[0].text;
    expect(text).toContain("[b1] TABLE");
    expect(text).toContain("A | B");
    expect(text).toContain("1 | 2");
  });

  it("never sends image data", () => {
    const wire = toWireDocument({ blocks: [{ id: "b0", type: "image", src: "data:image/png;base64,AAAA", alt: "A chart" }], warnings: [] });
    expect(JSON.stringify(wire)).not.toContain("base64");
  });
});

describe("chunking", () => {
  it("keeps whole sections together and in order", () => {
    const sections = sectionsOf(longLecture(12));
    const chunks = chunkSections(sections, 6_000);
    expect(chunks.length).toBeGreaterThan(1);
    const order = chunks.flatMap((c) => c.parts.map((x) => x.sectionId));
    expect(order).toEqual(sections.map((s) => s.id));
    for (const c of chunks) expect(c.chars).toBeLessThanOrEqual(6_000 + 600);
  });

  it("does not lose any text when sections are chunked", () => {
    const doc = longLecture(8);
    const sections = sectionsOf(doc);
    const joined = chunkSections(sections, 4_000).map(chunkToText).join("\n");
    for (const b of doc.blocks) if (b.type === "paragraph") expect(joined).toContain(b.text);
  });

  it("splits one oversized section at block boundaries, not mid-sentence", () => {
    const sentence = "This sentence is complete and ends properly.";
    const doc = makeDoc([h(1, "Big"), ...Array.from({ length: 30 }, (_, i) => p(`${sentence} Number ${i}.`))]);
    const chunks = chunkSections(sectionsOf(doc), 600);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.parts.every((x) => x.sectionId === "section-001"))).toBe(true);
    expect(chunks[1].parts[0].continued).toBe(true);
    for (const c of chunks) for (const part of c.parts) expect(part.text.trimEnd().endsWith(".")).toBe(true);
  });

  it("splits a single over-long paragraph at sentence boundaries and keeps every sentence", () => {
    const doc = technicalDoc();
    const sections = sectionsOf(doc);
    const chunks = chunkSections(sections, 500);
    const text = chunks.map(chunkToText).join(" ");
    for (const phrase of ["slow start threshold (ssthresh)", "fast retransmit and fast recovery", "fair share of the bottleneck link"]) {
      expect(text).toContain(phrase);
    }
  });

  it("splits long tables by rows and repeats the table header line", () => {
    const rows = Array.from({ length: 200 }, (_, i) => [`Row ${i}`, String(i * 3)]);
    const chunks = chunkSections(sectionsOf(makeDoc([h(1, "Data"), table(["Name", "Value"], rows)])), 800);
    expect(chunks.length).toBeGreaterThan(2);
    const all = chunks.map(chunkToText).join("\n");
    expect(all).toContain("Row 0 | 0");
    expect(all).toContain("Row 199 | 597");
    expect(chunks[1].parts[0].text).toContain("TABLE");
  });
});
