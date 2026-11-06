import type { ChunkDigest } from "./schemas";

/** Helpers for the compact per-section analyses that replace the original text after the first stage. */

type Entry = ChunkDigest["sections"][number];

export interface TableRef {
  id: string;
  headers?: string[];
  rows: string[][];
}
export interface ImageRef {
  id: string;
  alt?: string;
}
export interface SectionRef {
  id: string;
  heading?: string;
}

const MAX_TABLE_ROWS = 30;

/** Entries of several digests, merged per section (a section split over chunks has several), in document order. */
export function mergeBySection(digests: ChunkDigest[], sections: SectionRef[]): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>();
  for (const d of digests) for (const e of d.sections) map.set(e.sectionId, [...(map.get(e.sectionId) ?? []), e]);
  const ordered = new Map<string, Entry[]>();
  for (const s of sections) if (map.has(s.id)) ordered.set(s.id, map.get(s.id)!);
  for (const [id, v] of map) if (!ordered.has(id)) ordered.set(id, v);
  return ordered;
}

export function entryText(sectionId: string, heading: string | undefined, entries: Entry[]): string {
  const lines = [`=== ${sectionId}${heading ? ` — "${heading}"` : ""} ===`];
  for (const e of entries) {
    if (e.topic) lines.push(`Topic: ${e.topic}`);
    lines.push(`Summary: ${e.summary}`);
    if (e.learningObjectives?.length) lines.push(`Learning objectives: ${e.learningObjectives.join("; ")}`);
    for (const p of e.points) {
      const label = p.term ? `${p.kind}, term "${p.term}"` : p.kind;
      lines.push(`- (${label}; ${p.importance}${p.sourceBlocks?.length ? `; ${p.sourceBlocks.join(",")}` : ""}) ${p.text}`);
    }
  }
  return lines.join("\n");
}

/** Section analyses as prompt text (no tables or images). */
export function digestsText(digests: ChunkDigest[], sections: SectionRef[]): string {
  const merged = mergeBySection(digests, sections);
  const heading = new Map(sections.map((s) => [s.id, s.heading]));
  return Array.from(merged, ([id, entries]) => entryText(id, heading.get(id), entries)).join("\n\n");
}

/** What the final planning request sees: the analyses plus the document's tables and image ids, verbatim. */
export function formatDigests(digests: ChunkDigest[], sections: SectionRef[], tables: TableRef[], images: ImageRef[]): string {
  const rendered = tables.map(
    (t) =>
      `[${t.id}] TABLE${t.rows.length > MAX_TABLE_ROWS ? ` (first ${MAX_TABLE_ROWS} of ${t.rows.length} rows)` : ""}:\n${[...(t.headers ? [t.headers] : []), ...t.rows.slice(0, MAX_TABLE_ROWS)].map((r) => r.join(" | ")).join("\n")}`,
  );
  return [
    digestsText(digests, sections),
    ...(rendered.length ? ["=== TABLES OF THE DOCUMENT (reference them by block id) ===", ...rendered] : []),
    ...(images.length ? ["=== IMAGES OF THE DOCUMENT (reference them by block id) ===", ...images.map((i) => `[${i.id}] IMAGE${i.alt ? `: ${i.alt}` : ""}`)] : []),
  ].join("\n\n");
}

export function digestChars(digests: ChunkDigest[]): number {
  return digests.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.summary.length + (s.topic?.length ?? 0) + s.points.reduce((k, p) => k + p.text.length + 40, 0), 0), 0);
}

/**
 * Deterministic last resort when consolidation by the model did not make the outline small enough:
 * drop "low" then "medium" importance points from the end of the document, then cap the number of points
 * per section (6, 4, 3, 2, 1) until it fits. Reports what was removed so the user can be told, and
 * whether it fits at all (summaries alone may already be too large for a huge document).
 */
export function dropToFit(digests: ChunkDigest[], budgetChars: number): { digests: ChunkDigest[]; dropped: number; fits: boolean } {
  const copy: ChunkDigest[] = digests.map((d) => ({ sections: d.sections.map((s) => ({ ...s, points: [...s.points] })) }));
  let dropped = 0;
  const each = (fn: (e: Entry) => void) => {
    for (let di = copy.length - 1; di >= 0 && digestChars(copy) > budgetChars; di--) {
      for (let si = copy[di].sections.length - 1; si >= 0 && digestChars(copy) > budgetChars; si--) fn(copy[di].sections[si]);
    }
  };
  for (const level of ["low", "medium"] as const) {
    each((e) => {
      const before = e.points.length;
      e.points = e.points.filter((p, i) => p.importance !== level || i === 0);
      dropped += before - e.points.length;
    });
  }
  for (const cap of [6, 4, 3, 2, 1]) {
    if (digestChars(copy) <= budgetChars) break;
    each((e) => {
      if (e.points.length > cap) {
        dropped += e.points.length - cap;
        e.points = e.points.slice(0, cap);
      }
    });
  }
  return { digests: copy, dropped, fits: digestChars(copy) <= budgetChars };
}
