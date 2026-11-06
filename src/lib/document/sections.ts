import type { WireBlock } from "./wire";

/**
 * Logical sections of a document. Ids are stable (`section-001`, …) and derived only from the block
 * order, so the browser and the server compute identical sections for the same document.
 */
export interface Section {
  id: string;
  /** Text of the heading that opened the section (absent for the opening part of a document). */
  heading?: string;
  level: number;
  blockIds: string[];
  /** Blocks of the section as plain text, each prefixed with its id: `[b3] …`. */
  text: string;
  chars: number;
}

const pad = (n: number) => String(n).padStart(3, "0");

/** One block as text for the model, prefixed with its id so answers can point back at it. */
export function blockToText(block: WireBlock): string {
  switch (block.type) {
    case "title":
      return `[${block.id}] DOCUMENT TITLE: ${block.text}`;
    case "heading":
      return `[${block.id}] ${"#".repeat(block.level)} ${block.text}`;
    case "paragraph":
      return `[${block.id}] ${block.text}`;
    case "list":
      return `[${block.id}] ${block.ordered ? "NUMBERED LIST" : "LIST"}:\n${block.items.map((item, i) => (block.ordered ? `${i + 1}. ${item}` : `- ${item}`)).join("\n")}`;
    case "table": {
      const rows = [...(block.headers ? [block.headers] : []), ...block.rows];
      return `[${block.id}] TABLE${block.headers ? " (first row is the header)" : ""}:\n${rows.map((r) => r.join(" | ")).join("\n")}`;
    }
    case "image":
      return `[${block.id}] IMAGE${block.alt ? `: ${block.alt}` : ""}`;
    case "unsupported":
      return `[${block.id}] (content that could not be read: ${block.reason})`;
  }
}

export interface SectionOptions {
  /**
   * Sections longer than this are cut at block (paragraph, list, table) boundaries into consecutive
   * parts, so one huge chapter - or a document with no headings at all - still gets traceable ids.
   * A single block longer than this stays whole here; the chunker splits it by sentence or row.
   */
  maxChars?: number;
}

export function buildSections(blocks: WireBlock[], options: SectionOptions = {}): Section[] {
  const levels = blocks.flatMap((b) => (b.type === "heading" ? [b.level] : []));
  const splitAt = levels.length ? Math.min(3, Math.min(...levels) + 1) : 0;

  const groups: { heading?: string; level: number; blocks: WireBlock[] }[] = [];
  for (const block of blocks) {
    const opens = block.type === "heading" && block.level <= splitAt;
    if (opens || groups.length === 0) {
      groups.push({ heading: block.type === "heading" ? block.text : undefined, level: block.type === "heading" ? block.level : 0, blocks: [] });
    }
    groups[groups.length - 1].blocks.push(block);
  }

  // Cut over-long groups into parts of about maxChars, only between blocks.
  const parts: typeof groups = [];
  for (const g of groups) {
    const texts = g.blocks.map(blockToText);
    const total = texts.reduce((n, t) => n + t.length + 1, 0);
    if (!options.maxChars || total <= options.maxChars) {
      parts.push(g);
      continue;
    }
    let current: WireBlock[] = [];
    let size = 0;
    let n = 0;
    const flush = () => {
      if (!current.length) return;
      parts.push({ heading: g.heading ? (n ? `${g.heading} (part ${n + 1})` : g.heading) : undefined, level: g.level, blocks: current });
      n++;
      current = [];
      size = 0;
    };
    g.blocks.forEach((b, i) => {
      if (size > 0 && size + texts[i].length > options.maxChars!) flush();
      current.push(b);
      size += texts[i].length + 1;
    });
    flush();
  }

  return parts.map((g, i) => {
    const text = g.blocks.map(blockToText).join("\n");
    return { id: `section-${pad(i + 1)}`, heading: g.heading, level: g.level, blockIds: g.blocks.map((b) => b.id), text, chars: text.length };
  });
}

export function totalChars(sections: Section[]): number {
  return sections.reduce((n, s) => n + s.chars, 0);
}
