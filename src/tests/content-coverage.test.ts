import { describe, expect, it } from "vitest";
import { sampleParts } from "../../scripts/sample-content.ts";
import { planSlides } from "@/lib/slides/planner";
import { slideText } from "@/lib/slides/types";
import type { DocumentBlock } from "@/lib/docx/types";
import { parseParts, words } from "./helpers";

function blockText(b: DocumentBlock): string {
  switch (b.type) {
    case "title":
    case "heading":
    case "paragraph":
      return b.text;
    case "list":
      return b.items.join(" ");
    case "table":
      return [...(b.headers ?? []), ...b.rows.flat()].join(" ");
    case "image":
      return b.alt ?? "";
    default:
      return "";
  }
}

describe("content coverage", () => {
  it("assigns every block of the sample lecture to a slide and keeps every word", async () => {
    const doc = await parseParts(sampleParts());
    for (const density of ["concise", "balanced", "detailed"] as const) {
      for (const preferDiagrams of [false, true]) {
        const plan = planSlides(doc, { density, preferDiagrams });
        const { coverage } = plan;
        expect(coverage.assigned.length + coverage.metadata.length + coverage.unsupported.length).toBe(coverage.totalBlocks);
        expect(coverage.recovered).toEqual([]);

        const shown = new Set(words(plan.slides.map(slideText).join(" ")));
        const missing = words(doc.blocks.map(blockText).join(" ")).filter((w) => !shown.has(w));
        expect(missing).toEqual([]);

        // Every block id that a slide claims exists, and every block is claimed by some slide.
        const claimed = new Set(plan.slides.flatMap((s) => s.sourceIds));
        doc.blocks.forEach((b) => expect(claimed.has(b.id)).toBe(true));
      }
    }
  });

  it("uses a variety of layouts for a structured document", async () => {
    const doc = await parseParts(sampleParts());
    const kinds = new Set(planSlides(doc, { density: "balanced" }).slides.map((s) => s.kind));
    for (const k of ["cover", "section", "definition", "bullets", "imageText", "comparison", "process", "table", "timeline", "conclusion"]) {
      expect(kinds.has(k as never), k).toBe(true);
    }
  });

  it("keeps all words for unstructured text-only documents", async () => {
    const text = "Plain paragraph one has several words. ".repeat(12);
    const doc = await parseParts([{ kind: "p", text }, { kind: "ul", items: ["alpha item", "beta item", "gamma item"] }, { kind: "p", text: "Closing remark." }]);
    const plan = planSlides(doc, { density: "concise" });
    const shown = new Set(words(plan.slides.map(slideText).join(" ")));
    expect(words(doc.blocks.map(blockText).join(" ")).filter((w) => !shown.has(w))).toEqual([]);
  });
});
