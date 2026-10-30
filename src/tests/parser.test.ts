import { describe, expect, it } from "vitest";
import { encodePng } from "../../scripts/docx-builder.ts";
import { parseDocx, htmlToBlocks } from "@/lib/docx/parser";
import { AppError } from "@/lib/utils/errors";
import { parseParts } from "./helpers";

describe("parseDocx", () => {
  it("extracts title, headings, paragraphs and links in order", async () => {
    const doc = await parseParts([
      { kind: "title", text: "Cell Biology" },
      { kind: "heading", level: 1, text: "The Cell" },
      { kind: "p", text: "Cells are the basic unit of life." },
      { kind: "heading", level: 2, text: "Organelles" },
      { kind: "heading", level: 3, text: "Mitochondria" },
      { kind: "p", text: "Read more at ", link: { text: "the course site", href: "https://example.edu" } },
    ]);
    expect(doc.title).toBe("Cell Biology");
    expect(doc.blocks.map((b) => b.type)).toEqual(["title", "heading", "paragraph", "heading", "heading", "paragraph"]);
    expect(doc.blocks[1]).toMatchObject({ type: "heading", level: 1, text: "The Cell" });
    expect(doc.blocks[4]).toMatchObject({ type: "heading", level: 3 });
    const last = doc.blocks[5];
    expect(last.type === "paragraph" && last.links).toEqual([{ text: "the course site", href: "https://example.edu" }]);
  });

  it("extracts ordered and unordered lists", async () => {
    const doc = await parseParts([
      { kind: "ul", items: ["Apples", "Pears"] },
      { kind: "p", text: "Between lists." },
      { kind: "ol", items: ["First", "Second", "Third"] },
    ]);
    expect(doc.blocks[0]).toMatchObject({ type: "list", ordered: false, items: ["Apples", "Pears"] });
    expect(doc.blocks[2]).toMatchObject({ type: "list", ordered: true, items: ["First", "Second", "Third"] });
  });

  it("extracts tables with header rows", async () => {
    const doc = await parseParts([
      { kind: "table", header: true, rows: [["Name", "Value"], ["A", "1"], ["B", "2"]] },
      { kind: "table", rows: [["x", "y"]] },
    ]);
    expect(doc.blocks[0]).toMatchObject({ type: "table", headers: ["Name", "Value"], rows: [["A", "1"], ["B", "2"]] });
    expect(doc.blocks[1]).toMatchObject({ type: "table", rows: [["x", "y"]] });
    expect(doc.blocks[1].type === "table" && doc.blocks[1].headers).toBeUndefined();
  });

  it("embeds images as data URIs", async () => {
    const png = encodePng(4, 3, () => [255, 0, 0]);
    const doc = await parseParts([
      { kind: "p", text: "Figure below." },
      { kind: "image", png, widthPx: 4, heightPx: 3, alt: "A red square" },
    ]);
    const img = doc.blocks.find((b) => b.type === "image");
    expect(img).toBeDefined();
    expect(img!.type === "image" && img!.src.startsWith("data:image/png;base64,")).toBe(true);
    expect(img!.type === "image" && img!.alt).toBe("A red square");
  });

  it("records a leading bold run for definitions", async () => {
    const doc = await parseParts([{ kind: "p", text: "Osmosis: movement of water across a membrane.", leadBold: "Osmosis:" }]);
    expect(doc.blocks[0]).toMatchObject({ type: "paragraph", leadBold: "Osmosis:" });
  });

  it("promotes bold lines to headings when a document has no headings", async () => {
    const doc = await parseParts([
      { kind: "p", text: "Background", bold: true },
      { kind: "p", text: "Some text here." },
    ]);
    expect(doc.blocks[0]).toMatchObject({ type: "heading", level: 2, text: "Background" });
  });

  it("rejects an empty document", async () => {
    await expect(parseParts([])).rejects.toMatchObject({ code: "empty-document" });
  });

  it("rejects a corrupted file", async () => {
    const junk = new TextEncoder().encode("this is not a zip file").buffer as ArrayBuffer;
    await expect(parseDocx(junk, "broken.docx")).rejects.toBeInstanceOf(AppError);
    const fakeZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]).buffer;
    await expect(parseDocx(fakeZip, "broken.docx")).rejects.toMatchObject({ code: "corrupted" });
  });
});

describe("htmlToBlocks (sanitization)", () => {
  it("never keeps scripts, event handlers or external image sources", () => {
    const { blocks } = htmlToBlocks(
      `<p>Hello <script>alert(1)</script></p><p><img src="https://evil.example/x.png" onerror="alert(1)"></p><p><a href="javascript:alert(1)">bad</a></p>`,
    );
    const json = JSON.stringify(blocks);
    expect(json).not.toContain("evil.example");
    expect(json).not.toContain("javascript:");
    expect(blocks.filter((b) => b.type === "image")).toHaveLength(0);
  });
});
