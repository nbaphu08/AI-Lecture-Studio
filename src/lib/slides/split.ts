import type { Slide } from "./types";
import { splitLongText } from "./content-analysis";

const CONT = / \(cont\.\)$/;

function half<T>(items: T[]): [T[], T[]] {
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

/** A single over-long item is cut at sentence boundaries so that it can be spread over two slides. */
function expand(items: string[]): string[] {
  if (items.length !== 1) return items;
  return splitLongText(items[0], Math.ceil(items[0].length / 2) + 40);
}

const contTitle = (title: string) => `${title.replace(CONT, "")} (cont.)`;

/**
 * Split an overloaded slide into two slides that each carry about half of the content.
 * Returns null for slides that cannot be split (covers, dividers, definitions, images, charts).
 */
export function splitSlide(slide: Slide): [Slide, Slide] | null {
  const second = <T extends Slide>(s: T): T => ({ ...s, title: contTitle(s.title), notes: undefined });
  switch (slide.kind) {
    case "bullets": {
      const items = expand(slide.bullets);
      if (items.length < 2) return null;
      const [a, b] = half(items);
      return [{ ...slide, bullets: a }, second({ ...slide, lead: undefined, bullets: b })];
    }
    case "content": {
      let paragraphs = slide.paragraphs;
      if (paragraphs.length === 1) paragraphs = splitLongText(paragraphs[0], Math.ceil(paragraphs[0].length / 2) + 40);
      if (paragraphs.length < 2) return null;
      const [a, b] = half(paragraphs);
      return [{ ...slide, paragraphs: a }, second({ ...slide, paragraphs: b })];
    }
    case "conclusion": {
      const items = expand(slide.points);
      if (items.length < 2) return null;
      const [a, b] = half(items);
      return [{ ...slide, points: a }, second({ ...slide, points: b })];
    }
    case "twoColumn": {
      const [l, r] = slide.columns;
      if (Math.max(l.items.length, r.items.length) < 2) return null;
      const [l1, l2] = half(l.items);
      const [r1, r2] = half(r.items);
      return [
        { ...slide, columns: [{ ...l, items: l1 }, { ...r, items: r1 }] },
        second({ ...slide, columns: [{ ...l, items: l2 }, { ...r, items: r2 }] }),
      ];
    }
    case "comparison": {
      if (Math.max(slide.left.items.length, slide.right.items.length) < 2) return null;
      const [l1, l2] = half(slide.left.items);
      const [r1, r2] = half(slide.right.items);
      return [
        { ...slide, left: { ...slide.left, items: l1 }, right: { ...slide.right, items: r1 } },
        second({ ...slide, left: { ...slide.left, items: l2 }, right: { ...slide.right, items: r2 } }),
      ];
    }
    case "table": {
      if (slide.rows.length < 2) return null;
      const [a, b] = half(slide.rows);
      return [{ ...slide, rows: a }, second({ ...slide, rows: b })];
    }
    case "process": {
      if (slide.steps.length < 4) return null;
      const [a, b] = half(slide.steps);
      return [{ ...slide, steps: a }, second({ ...slide, steps: b, startAt: slide.startAt + a.length })];
    }
    case "timeline": {
      if (slide.events.length < 4) return null;
      const [a, b] = half(slide.events);
      return [{ ...slide, events: a }, second({ ...slide, events: b })];
    }
    case "quiz": {
      const items = expand(slide.prompts);
      if (items.length < 2) return null;
      const [a, b] = half(items);
      return [{ ...slide, prompts: a }, second({ ...slide, prompts: b, startAt: slide.startAt + a.length })];
    }
    default:
      return null;
  }
}
