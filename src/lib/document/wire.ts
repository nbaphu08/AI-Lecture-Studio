import * as z from "zod";
import type { DocumentBlock, ParsedDocument } from "@/lib/docx/types";

/**
 * The document as sent to the server: the structure and text of every block, but never image data.
 * (Images stay in the browser and are re-attached to the slides by block id.)
 */
export type WireBlock = Exclude<DocumentBlock, { type: "image" }> | { id: string; type: "image"; alt?: string };

export interface WireDocument {
  title?: string;
  blocks: WireBlock[];
}

export function toWireDocument(doc: ParsedDocument): WireDocument {
  return {
    title: doc.title,
    blocks: doc.blocks.map((b): WireBlock => {
      if (b.type === "image") return { id: b.id, type: "image", alt: b.alt };
      if (b.type === "paragraph") {
        // Link targets are not needed to plan slides.
        const { links: _links, ...rest } = b;
        void _links;
        return rest;
      }
      return b;
    }),
  };
}

const text = (max: number) => z.string().max(max);
const id = z.string().min(1).max(40);

const blockSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("title"), text: text(2_000) }),
  z.object({ id, type: z.literal("heading"), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: text(2_000) }),
  z.object({
    id,
    type: z.literal("paragraph"),
    text: text(60_000),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    leadBold: text(2_000).optional(),
    subtitle: z.boolean().optional(),
  }),
  z.object({ id, type: z.literal("list"), ordered: z.boolean(), items: z.array(text(10_000)).max(2_000) }),
  z.object({
    id,
    type: z.literal("table"),
    headers: z.array(text(2_000)).max(60).optional(),
    rows: z.array(z.array(text(5_000)).max(60)).max(2_000),
  }),
  z.object({ id, type: z.literal("image"), alt: text(1_000).optional() }),
  z.object({ id, type: z.literal("unsupported"), reason: text(1_000) }),
]);

/** Request body of POST /api/analyze. Everything the server accepts is validated here. */
export const analyzeRequestSchema = z.object({
  title: text(2_000).optional(),
  fileName: text(300).optional(),
  density: z.enum(["concise", "balanced", "detailed"]),
  preferDiagrams: z.boolean().optional(),
  blocks: z.array(blockSchema).min(1).max(20_000),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
