import { splitLongText } from "@/lib/slides/content-analysis";
import type { Section } from "./sections";

export interface ChunkPart {
  sectionId: string;
  heading?: string;
  /** Section text (or a continuation of it) with block ids. */
  text: string;
  /** True when this is a later part of a section that was too long for one chunk. */
  continued: boolean;
}

export interface Chunk {
  id: string;
  parts: ChunkPart[];
  chars: number;
}

/** Split one over-long block: tables and lists by line (repeating the header), prose by sentence. */
function splitBlock(block: string, max: number): string[] {
  if (block.length <= max) return [block];
  const tag = /^\[[^\]]+\]/.exec(block)?.[0] ?? "";
  if (block.includes("\n")) {
    const [head, ...rows] = block.split("\n");
    const out: string[] = [];
    let buf = head;
    for (const row of rows) {
      if (buf.length + row.length + 1 > max && buf !== head) {
        out.push(buf);
        buf = head;
      }
      buf = `${buf}\n${row.slice(0, Math.max(200, max - head.length - 1))}`;
    }
    out.push(buf);
    return out;
  }
  return splitLongText(block.slice(tag.length).trim(), Math.max(200, max - tag.length - 1)).map((t) => `${tag} ${t}`);
}

/** Split an over-long section at block boundaries, and an over-long block at line or sentence boundaries. */
function splitSection(section: Section, max: number): string[] {
  const blocks = section.text.split(/\n(?=\[[^\]\n]+\] )/).flatMap((b) => splitBlock(b, max));
  const out: string[] = [];
  let buf = "";
  for (const piece of blocks) {
    if (buf && buf.length + piece.length + 1 > max) {
      out.push(buf);
      buf = "";
    }
    buf = buf ? `${buf}\n${piece}` : piece;
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Group sections into chunks of about `maxChars`, keeping the original order. Sections are never
 * split unless one alone exceeds the limit; then it is cut at block (or sentence) boundaries.
 */
export function chunkSections(sections: Section[], maxChars: number): Chunk[] {
  const chunks: Chunk[] = [];
  let current: ChunkPart[] = [];
  let size = 0;

  const flush = () => {
    if (!current.length) return;
    chunks.push({ id: `chunk-${chunks.length + 1}`, parts: current, chars: size });
    current = [];
    size = 0;
  };

  for (const section of sections) {
    const pieces = section.chars > maxChars ? splitSection(section, maxChars) : [section.text];
    pieces.forEach((text, i) => {
      if (size > 0 && size + text.length > maxChars) flush();
      current.push({ sectionId: section.id, heading: section.heading, text, continued: i > 0 });
      size += text.length + 40; // + header line
    });
  }
  flush();
  return chunks;
}

/** A chunk as one prompt string. */
export function chunkToText(chunk: Chunk): string {
  return chunk.parts
    .map((p) => `=== ${p.sectionId}${p.heading ? ` — "${p.heading}"` : ""}${p.continued ? " (continued)" : ""} ===\n${p.text}`)
    .join("\n\n");
}
