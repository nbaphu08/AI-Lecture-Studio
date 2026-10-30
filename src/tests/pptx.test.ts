// @vitest-environment node
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { sampleParts } from "../../scripts/sample-content.ts";
import { writePptx } from "@/lib/pptx/generate";
import { composeDeck } from "@/lib/pptx/compose";
import { planSlides } from "@/lib/slides/planner";
import { resolveSettings } from "@/lib/design/style-hints";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { THEME_LIST } from "@/lib/design/themes";
import { htmlToBlocks } from "@/lib/docx/parser";
import type { ParsedDocument } from "@/lib/docx/types";
import type { Shape } from "@/lib/pptx/draw";

// The parser needs DOMParser; provide it from jsdom for this Node-environment test.
const { window } = new JSDOM("");
Object.assign(globalThis, { DOMParser: window.DOMParser, Node: window.Node });

async function sampleDoc(): Promise<ParsedDocument> {
  const { buildDocx } = await import("../../scripts/docx-builder.ts");
  const mammoth = (await import("mammoth")).default;
  const bytes = await buildDocx(sampleParts());
  const { value } = await mammoth.convertToHtml(
    { buffer: Buffer.from(bytes) },
    {
      styleMap: ["p[style-name='Title'] => h1.doc-title:fresh", "p[style-name='Subtitle'] => p.doc-subtitle:fresh"],
      convertImage: mammoth.images.imgElement(async (img) => ({ src: `data:${img.contentType};base64,${await img.read("base64")}` })),
    },
  );
  const parsed = htmlToBlocks(value);
  return { title: parsed.title, blocks: parsed.blocks, warnings: [] };
}

function inBounds(s: Shape, w: number, h: number): boolean {
  const eps = 0.01;
  if (s.t === "line") return Math.min(s.x1, s.x2) >= -eps && Math.max(s.x1, s.x2) <= w + eps && Math.min(s.y1, s.y2) >= -eps && Math.max(s.y1, s.y2) <= h + eps;
  if (s.t === "poly") return s.points.every(([x, y]) => x >= -eps && x <= w + eps && y >= -eps && y <= h + eps);
  if (s.t === "table") return s.x >= 0 && s.x + s.w <= w + eps && s.y + s.rowH.reduce((a, b) => a + b, 0) <= h + eps;
  return s.x >= -eps && s.y >= -eps && s.x + s.w <= w + eps && s.y + s.h <= h + eps;
}

describe("PPTX generation", () => {
  it("produces a valid .pptx for every theme and aspect ratio", async () => {
    const doc = await sampleDoc();
    for (const theme of THEME_LIST) {
      for (const aspect of ["16:9", "4:3"] as const) {
        const settings = resolveSettings({ ...DEFAULT_SETTINGS, themeId: theme.id, aspect });
        const plan = planSlides(doc, { density: settings.density });
        const deck = composeDeck(plan, settings);
        expect(deck.slides).toHaveLength(plan.slides.length);

        // Text, images, cards and tables stay inside the slide (decorative ellipses may bleed off the edge).
        deck.slides.forEach((slide, i) =>
          slide.shapes
            .filter((s) => s.t !== "ellipse")
            .forEach((s) => expect(inBounds(s, deck.w, deck.h), `${theme.id} ${aspect} slide ${i + 1} ${s.t}`).toBe(true)),
        );

        const buffer = (await writePptx(deck, { title: plan.title })) as Uint8Array;
        const zip = await JSZip.loadAsync(buffer);
        const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
        expect(slideFiles).toHaveLength(plan.slides.length);
        expect(Object.keys(zip.files).some((f) => f.startsWith("ppt/media/"))).toBe(true);

        // Every slide is well-formed XML and the table/text content is native (editable).
        const parser = new window.DOMParser();
        let allXml = "";
        for (const f of slideFiles) {
          const xml = await zip.file(f)!.async("string");
          expect(parser.parseFromString(xml, "application/xml").getElementsByTagName("parsererror")).toHaveLength(0);
          allXml += xml;
        }
        expect(allXml).toContain("<a:tbl>");
        // Gradients are written as real gradient fills, and no placeholder color is left behind.
        expect(allXml).toContain("<a:gradFill");
        expect(allXml).not.toMatch(/val="F1E2D3"/);
        expect(allXml).toContain("Introduction to Renewable Energy");
        expect(allXml).toContain("Edmond Becquerel");
        const presXml = await zip.file("ppt/presentation.xml")!.async("string");
        const cx = Math.round((aspect === "16:9" ? 13.333 : 10) * 914400);
        expect(presXml).toContain(`cx="${cx}"`);
      }
    }
  });

  it("applies style hints to the theme", async () => {
    const doc = await sampleDoc();
    const settings = resolveSettings({ ...DEFAULT_SETTINGS, themeId: "modern", styleHint: "dark background, green, large titles" });
    const deck = composeDeck(planSlides(doc, { density: "balanced" }), settings);
    // Slide 2 is the "Overview" content slide; dividers use the primary color instead.
    expect(deck.slides[1].background).toBe("111827");
  });
});
