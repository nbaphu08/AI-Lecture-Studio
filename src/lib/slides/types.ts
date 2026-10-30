export type Density = "concise" | "balanced" | "detailed";

export interface SlideImage {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface Column {
  heading?: string;
  items: string[];
}

export interface TimelineEvent {
  date: string;
  text: string;
}

interface SlideBase {
  id: string;
  /** Ids of the source document blocks shown on this slide. */
  sourceIds: string[];
  /** Label of the document section this slide belongs to. */
  section?: string;
}

export type Slide = SlideBase &
  (
    | { kind: "cover"; title: string; subtitle?: string }
    | { kind: "section"; title: string; number: number }
    | { kind: "content"; title: string; paragraphs: string[] }
    | { kind: "bullets"; title: string; lead?: string; bullets: string[]; numbered?: boolean }
    | { kind: "twoColumn"; title: string; columns: [Column, Column] }
    | { kind: "definition"; title: string; term: string; definition: string }
    | { kind: "process"; title: string; steps: string[]; startAt: number }
    | { kind: "timeline"; title: string; events: TimelineEvent[] }
    | { kind: "comparison"; title: string; left: Column; right: Column }
    | { kind: "table"; title: string; headers?: string[]; rows: string[][] }
    | { kind: "imageText"; title: string; image: SlideImage; paragraphs: string[]; bullets: string[] }
    | { kind: "conclusion"; title: string; points: string[] }
  );

export type SlideKind = Slide["kind"];

export interface CoverageReport {
  totalBlocks: number;
  /** Source blocks shown on at least one slide. */
  assigned: string[];
  /** Source blocks deliberately not displayed (none in the current rules; reserved). */
  metadata: string[];
  /** Source blocks that could not be turned into slides, with the reason. */
  unsupported: { id: string; reason: string }[];
  /** Blocks the layout rules missed and the safety net placed on a plain slide. */
  recovered: string[];
}

export interface DeckPlan {
  title: string;
  subtitle?: string;
  slides: Slide[];
  coverage: CoverageReport;
  warnings: string[];
}

export interface PlannerOptions {
  density: Density;
  /** Used to name the deck when the document has no usable title. */
  fileName?: string;
  /** Loosens the thresholds for process/timeline diagrams. */
  preferDiagrams?: boolean;
}

/** All visible text on a slide, used for coverage checks. */
export function slideText(slide: Slide): string {
  const parts: string[] = [];
  switch (slide.kind) {
    case "cover":
      parts.push(slide.title, slide.subtitle ?? "");
      break;
    case "section":
      parts.push(slide.title);
      break;
    case "content":
      parts.push(slide.title, ...slide.paragraphs);
      break;
    case "bullets":
      parts.push(slide.title, slide.lead ?? "", ...slide.bullets);
      break;
    case "twoColumn":
      slide.columns.forEach((c) => parts.push(c.heading ?? "", ...c.items));
      parts.push(slide.title);
      break;
    case "definition":
      parts.push(slide.title, slide.term, slide.definition);
      break;
    case "process":
      parts.push(slide.title, ...slide.steps);
      break;
    case "timeline":
      parts.push(slide.title, ...slide.events.flatMap((e) => [e.date, e.text]));
      break;
    case "comparison":
      parts.push(slide.title, slide.left.heading ?? "", ...slide.left.items, slide.right.heading ?? "", ...slide.right.items);
      break;
    case "table":
      parts.push(slide.title, ...(slide.headers ?? []), ...slide.rows.flat());
      break;
    case "imageText":
      parts.push(slide.title, slide.image.alt ?? "", ...slide.paragraphs, ...slide.bullets);
      break;
    case "conclusion":
      parts.push(slide.title, ...slide.points);
      break;
  }
  return parts.filter(Boolean).join(" ");
}
