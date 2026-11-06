import * as z from "zod";
import { digestSchema } from "./schemas";

/**
 * Request bodies of the step endpoints used for large documents. Each step is a separate, short
 * request: nothing is stored on the server between steps; the browser keeps the intermediate results.
 */

const sectionId = z.string().regex(/^section-\d{3,5}$/);
const short = (max: number) => z.string().max(max);

export const chunkRequestSchema = z.object({
  index: z.number().int().min(0).max(1_000),
  total: z.number().int().min(1).max(1_000),
  chunk: z.object({
    id: short(40),
    context: short(20_000).optional(),
    parts: z
      .array(z.object({ sectionId, heading: short(2_000).optional(), text: short(300_000), continued: z.boolean() }))
      .min(1)
      .max(500),
  }),
});
export type ChunkRequest = z.infer<typeof chunkRequestSchema>;

export const consolidateRequestSchema = z.object({
  digests: z.array(digestSchema).min(1).max(400),
  sections: z.array(z.object({ id: sectionId, heading: short(2_000).optional() })).max(5_000),
  targetChars: z.number().int().min(1_000).max(300_000),
});
export type ConsolidateRequest = z.infer<typeof consolidateRequestSchema>;

export const planRequestSchema = z.object({
  title: short(2_000).optional(),
  fileName: short(300).optional(),
  density: z.enum(["concise", "balanced", "detailed"]),
  preferDiagrams: z.boolean().optional(),
  /** Characters of the original text this request covers (drives the suggested slide count). */
  totalChars: z.number().int().min(1).max(10_000_000),
  sections: z.array(z.object({ id: sectionId, heading: short(2_000).optional() })).min(1).max(5_000),
  /** Set when a long presentation is planned in consecutive parts. */
  part: z.object({ index: z.number().int().min(0).max(100), total: z.number().int().min(1).max(100) }).optional(),
  digests: z.array(digestSchema).min(1).max(400),
  tables: z.array(z.object({ id: short(40), headers: z.array(short(2_000)).max(60).optional(), rows: z.array(z.array(short(5_000)).max(60)).max(5_000) })).max(2_000),
  images: z.array(z.object({ id: short(40), alt: short(1_000).optional() })).max(2_000),
  /** Normalized numbers found in the original document, used to check charts and slide text. */
  numbers: z.array(short(30)).max(100_000),
});
export type PlanRequest = z.infer<typeof planRequestSchema>;

/** What the browser needs to know about the server's limits (nothing secret). */
export interface Limits {
  model: string;
  singleCallChars: number;
  chunkChars: number;
  chunkOverlapChars: number;
  planInputChars: number;
  maxDocChars: number;
  maxChunks: number;
  concurrency: number;
  maxRetries: number;
}
