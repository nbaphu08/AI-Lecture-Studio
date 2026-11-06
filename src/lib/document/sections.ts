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

export function buildSections(blocks: WireBlock[]): Section[] {
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

  return groups.map((g, i) => {
    const text = g.blocks.map(blockToText).join("\n");
    return { id: `section-${pad(i + 1)}`, heading: g.heading, level: g.level, blockIds: g.blocks.map((b) => b.id), text, chars: text.length };
  });
}

export function totalChars(sections: Section[]): number {
  return sections.reduce((n, s) => n + s.chars, 0);
}
