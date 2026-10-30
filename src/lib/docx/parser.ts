import mammoth from "mammoth";
import { AppError } from "@/lib/utils/errors";
import { assertValidDocx } from "./validation";
import type { DocLink, DocumentBlock, ParsedDocument } from "./types";

const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/svg+xml"];
const SAFE_LINK = /^(https?:|mailto:)/i;

const STYLE_MAP = [
  "p[style-name='Title'] => h1.doc-title:fresh",
  "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
];

type BlockDraft = DocumentBlock extends infer B ? (B extends unknown ? Omit<B, "id"> : never) : never;

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Text of an element, excluding nested lists. */
function ownText(el: Element): string {
  let out = "";
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      const tag = child.tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") return;
      out += tag === "br" ? " " : ownText(child);
    }
  });
  return clean(out);
}

function collectListItems(list: Element, items: string[]): void {
  Array.from(list.children).forEach((li) => {
    if (li.tagName.toLowerCase() !== "li") return;
    const text = ownText(li);
    if (text) items.push(text);
    Array.from(li.children).forEach((child) => {
      const tag = child.tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") collectListItems(child, items);
    });
  });
}

function collectLinks(el: Element): DocLink[] {
  const links: DocLink[] = [];
  el.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    const text = clean(a.textContent);
    if (text && SAFE_LINK.test(href)) links.push({ text, href });
  });
  return links;
}

/** Only keep image data URIs of formats PowerPoint can display. */
function readImage(img: Element): { block: BlockDraft } | { skipped: string } {
  const src = img.getAttribute("src") ?? "";
  const match = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(src);
  if (!match) return { skipped: "An image that could not be read was skipped." };
  const type = match[1].toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.includes(type)) {
    return { skipped: `An embedded image in ${type.replace("image/", "").toUpperCase()} format is not supported and was skipped.` };
  }
  return { block: { type: "image", src, alt: clean(img.getAttribute("alt")) || undefined } };
}

function paragraphBlocks(p: Element, out: BlockDraft[], warnings: string[]): void {
  const text = clean(p.textContent);
  const images = Array.from(p.querySelectorAll("img"));

  if (text) {
    const isSubtitle = p.classList.contains("doc-subtitle");
    const strong = p.querySelector("strong, b");
    const em = p.querySelector("em, i");
    const fullyBold = !!strong && clean(strong.textContent) === text;
    const fullyItalic = !!em && clean(em.textContent) === text;

    let leadBold: string | undefined;
    const firstNode = Array.from(p.childNodes).find((n) => clean(n.textContent) !== "");
    if (firstNode && firstNode.nodeType === Node.ELEMENT_NODE) {
      const tag = (firstNode as Element).tagName.toLowerCase();
      if (tag === "strong" || tag === "b") {
        const lead = clean(firstNode.textContent);
        if (lead && lead !== text) leadBold = lead;
      }
    }

    const links = collectLinks(p);
    out.push({
      type: "paragraph",
      text,
      bold: fullyBold || undefined,
      italic: fullyItalic || undefined,
      leadBold,
      subtitle: isSubtitle || undefined,
      links: links.length ? links : undefined,
    });
  }

  for (const img of images) {
    const result = readImage(img);
    if ("block" in result) out.push(result.block);
    else warnings.push(result.skipped);
  }
}

function tableBlock(table: Element): BlockDraft | null {
  const rows: string[][] = [];
  let headerRowCount = 0;
  table.querySelectorAll("tr").forEach((tr) => {
    // Skip rows of nested tables; they are flattened into their parent cell text.
    if (tr.closest("table") !== table) return;
    const cells = Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName));
    if (!cells.length) return;
    if (cells.every((c) => c.tagName.toLowerCase() === "th") && rows.length === headerRowCount) headerRowCount++;
    rows.push(cells.map((c) => clean(c.textContent)));
  });
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
  if (normalized.every((r) => r.every((c) => c === ""))) return null;
  if (headerRowCount > 0) {
    return { type: "table", headers: normalized[0], rows: normalized.slice(1) };
  }
  return { type: "table", rows: normalized };
}

/** Convert sanitized HTML (as produced by Mammoth) into typed blocks. Never renders the HTML. */
export function htmlToBlocks(html: string): { blocks: DocumentBlock[]; title?: string; warnings: string[] } {
  // DOMParser creates an inert document: scripts do not run and resources are not fetched.
  const doc = new DOMParser().parseFromString(html, "text/html");
  const drafts: BlockDraft[] = [];
  const warnings: string[] = [];

  const visit = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const text = clean(el.textContent);
      if (text) {
        if (el.classList.contains("doc-title")) drafts.push({ type: "title", text });
        else drafts.push({ type: "heading", level: Math.min(Number(tag[1]), 3) as 1 | 2 | 3, text });
      }
      el.querySelectorAll("img").forEach((img) => {
        const r = readImage(img);
        if ("block" in r) drafts.push(r.block);
      });
    } else if (tag === "p") {
      paragraphBlocks(el, drafts, warnings);
    } else if (tag === "ul" || tag === "ol") {
      const items: string[] = [];
      collectListItems(el, items);
      if (items.length) drafts.push({ type: "list", ordered: tag === "ol", items });
    } else if (tag === "table") {
      const t = tableBlock(el);
      if (t) drafts.push(t);
      else warnings.push("An empty table was skipped.");
    } else if (tag === "img") {
      const r = readImage(el);
      if ("block" in r) drafts.push(r.block);
      else warnings.push(r.skipped);
    } else if (tag === "div" || tag === "section" || tag === "blockquote" || tag === "body") {
      Array.from(el.children).forEach(visit);
    } else {
      const text = clean(el.textContent);
      if (text) drafts.push({ type: "paragraph", text });
    }
  };
  Array.from(doc.body.children).forEach(visit);

  promoteBoldLinesToHeadings(drafts);

  const blocks = drafts.map((d, i) => ({ ...d, id: `b${i}` }) as DocumentBlock);
  const titleBlock = blocks.find((b) => b.type === "title");
  return { blocks, title: titleBlock && titleBlock.type === "title" ? titleBlock.text : undefined, warnings };
}

/**
 * Some documents fake headings with short bold lines. If a document has no real headings at all,
 * treat those lines as level-2 headings so the structure is not lost.
 */
function promoteBoldLinesToHeadings(drafts: BlockDraft[]): void {
  if (drafts.some((d) => d.type === "heading")) return;
  drafts.forEach((d, i) => {
    if (d.type === "paragraph" && d.bold && d.text.length <= 80 && !/[.!?]$/.test(d.text)) {
      drafts[i] = { type: "heading", level: 2, text: d.text };
    }
  });
}

function measureImage(src: string): Promise<{ width: number; height: number } | undefined> {
  if (typeof Image === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(undefined), 3000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : undefined);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(undefined);
    };
    img.src = src;
  });
}

export async function parseDocx(input: File | ArrayBuffer, fileName?: string): Promise<ParsedDocument> {
  // Duck-type instead of `instanceof ArrayBuffer`, which fails across realms (iframes, test DOMs).
  const isFile = typeof (input as File).arrayBuffer === "function";
  const buffer = isFile ? await (input as File).arrayBuffer() : (input as ArrayBuffer);
  const name = fileName ?? (isFile ? (input as File).name : "document.docx");
  assertValidDocx({ name, size: buffer.byteLength }, buffer);

  let html: string;
  const mammothMessages: string[] = [];
  try {
    const result = await mammoth.convertToHtml(
      // The browser build reads `arrayBuffer`; the Node build (used by tests) reads `buffer`.
      { arrayBuffer: buffer, buffer } as unknown as { arrayBuffer: ArrayBuffer },
      {
        styleMap: STYLE_MAP,
        convertImage: mammoth.images.imgElement(async (image) => {
          const data = await image.read("base64");
          return { src: `data:${image.contentType};base64,${data}` };
        }),
      },
    );
    html = result.value;
    result.messages.filter((m) => m.type === "error").forEach((m) => mammothMessages.push(m.message));
  } catch (error) {
    throw new AppError(
      "corrupted",
      "This document could not be opened. It may be damaged, password-protected, or not a valid Word file.",
      { cause: error },
    );
  }

  let parsed: ReturnType<typeof htmlToBlocks>;
  try {
    parsed = htmlToBlocks(html);
  } catch (error) {
    throw new AppError("parse-failed", "Something went wrong while reading the document structure.", { cause: error });
  }

  const warnings = [...parsed.warnings];
  if (mammothMessages.length) warnings.push("Some parts of the document could not be read and were skipped.");

  const hasText = parsed.blocks.some((b) => b.type !== "image" && b.type !== "unsupported");
  if (parsed.blocks.length === 0) {
    throw new AppError("empty-document", "This document appears to be empty. Add some text and try again.");
  }
  if (!hasText) {
    warnings.push("This document contains only images, so slides will mostly show pictures without text.");
  }

  // Measure images so layouts can fit them without distortion (browser only).
  await Promise.all(
    parsed.blocks.map(async (block) => {
      if (block.type !== "image") return;
      const size = await measureImage(block.src);
      if (size) Object.assign(block, size);
    }),
  );

  return { title: parsed.title, blocks: parsed.blocks, warnings };
}
