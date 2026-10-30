/** Structured, sanitized representation of a Word document. */

export interface DocLink {
  text: string;
  href: string;
}

export type DocumentBlock = { id: string } & (
  | { type: "title"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | {
      type: "paragraph";
      text: string;
      bold?: boolean;
      italic?: boolean;
      /** Text of a leading bold run, e.g. the "Term" in "**Term** – explanation". */
      leadBold?: string;
      /** Paragraph used Word's Subtitle style. */
      subtitle?: boolean;
      links?: DocLink[];
    }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers?: string[]; rows: string[][] }
  | { type: "image"; src: string; alt?: string; width?: number; height?: number }
  /** Content that was found but cannot be turned into slides. */
  | { type: "unsupported"; reason: string }
);

export type BlockType = DocumentBlock["type"];

export interface ParsedDocument {
  /** Explicit title (Word "Title" style), if present. */
  title?: string;
  blocks: DocumentBlock[];
  warnings: string[];
}
