import { planSchema, type AiPlan, type AiSlide, type Layout } from "@/lib/ai/schemas";
import { buildSections } from "@/lib/document/sections";
import { toWireDocument } from "@/lib/document/wire";
import type { DocumentBlock, ParsedDocument } from "@/lib/docx/types";
import { extractTimeline, packByLength, splitLongText } from "./content-analysis";
import type { Column, CoverageReport, DeckPlan, Density, Slide } from "./types";

/**
 * The design engine's interpretation of an AI slide plan: maps the AI's layout choices to the layouts
 * the renderer supports, falls back gracefully when a layout cannot hold the content, and splits
 * overloaded slides. Images and exact table cells come from the original document, never from the AI.
 */

interface Limits {
  bullets: number;
  bulletChars: number;
  proseChars: number;
  steps: number;
  events: number;
  tableRows: number;
}

export const LIMITS: Record<Density, Limits> = {
  concise: { bullets: 4, bulletChars: 360, proseChars: 300, steps: 4, events: 4, tableRows: 5 },
  balanced: { bullets: 6, bulletChars: 640, proseChars: 520, steps: 5, events: 5, tableRows: 7 },
  detailed: { bullets: 8, bulletChars: 900, proseChars: 780, steps: 6, events: 6, tableRows: 9 },
};

const IMAGE_TEXT_MAX = 460;
const LAYOUT_ALIASES: Record<string, Layout> = {
  title: "title",
  cover: "title",
  "title-slide": "title",
  "section-divider": "section-divider",
  section: "section-divider",
  divider: "section-divider",
  "title-content": "title-content",
  content: "title-content",
  bullets: "title-content",
  "title-and-content": "title-content",
  definition: "definition",
  "key-concept": "definition",
  "two-column": "two-column",
  "two-columns": "two-column",
  "text-image": "text-image",
  "image-text": "text-image",
  comparison: "comparison",
  compare: "comparison",
  process: "process",
  "process-flow": "process",
  flow: "process",
  timeline: "timeline",
  chart: "chart",
  table: "table",
  "key-takeaways": "key-takeaways",
  takeaways: "key-takeaways",
  conclusion: "key-takeaways",
  summary: "key-takeaways",
  quiz: "quiz",
  discussion: "quiz",
};

/** Map the AI's layout name to a supported layout; infer one from the content when the name is unknown. */
export function resolveLayout(s: AiSlide): Layout {
  const named = LAYOUT_ALIASES[s.layout.trim().toLowerCase().replace(/[\s_]+/g, "-")];
  if (named) return named;
  if (s.chart) return "chart";
  if (s.tableRef || s.table?.rows.length) return "table";
  if (s.events && s.events.length >= 2) return "timeline";
  if (s.steps && s.steps.length >= 2) return "process";
  if (s.term && s.definition) return "definition";
  if (s.questions?.length) return "quiz";
  if (s.columns && s.columns.length >= 2) return "two-column";
  return "title-content";
}

/** Split into the fewest groups of at most `max`, with sizes as even as possible (never 5 + 1). */
export function balanced<T>(items: T[], max: number): T[][] {
  if (!items.length) return [];
  const groups = Math.ceil(items.length / max);
  const size = Math.ceil(items.length / groups);
  return Array.from({ length: groups }, (_, i) => items.slice(i * size, (i + 1) * size)).filter((g) => g.length);
}

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));
const len = (s: string) => s.length;

type Draft = Slide extends infer S ? (S extends Slide ? Omit<S, "id" | "sourceIds" | "section" | "notes"> : never) : never;

export interface ConvertOptions {
  density: Density;
}

export function aiPlanToDeckPlan(rawPlan: AiPlan, doc: ParsedDocument, options: ConvertOptions, extraWarnings: string[] = []): DeckPlan {
  // The plan is validated again here: this function must be safe to call with any value.
  const plan = planSchema.parse(rawPlan);
  const limits = LIMITS[options.density];
  const sections = buildSections(toWireDocument(doc).blocks);
  const blocksOf = new Map(sections.map((s) => [s.id, s.blockIds]));
  const blockById = new Map<string, DocumentBlock>(doc.blocks.map((b) => [b.id, b]));
  const warnings: string[] = [...doc.warnings, ...extraWarnings];

  const slides: Slide[] = [];
  const cited = new Set<string>();
  let currentSection: string | undefined;
  let sectionNo = 0;

  const emit = (drafts: Draft[], s: AiSlide, notes: string | undefined) => {
    const sourceIds = uniq(s.sourceSections.flatMap((id) => blocksOf.get(id) ?? []));
    s.sourceSections.forEach((id) => cited.add(id));
    drafts.forEach((draft, i) => {
      slides.push({
        ...draft,
        id: `s${slides.length + 1}`,
        sourceIds,
        section: draft.kind === "cover" ? undefined : currentSection,
        notes: i === 0 ? notes : undefined,
      } as Slide);
    });
  };

  const title = (s: AiSlide, i: number) => (i === 0 ? s.title : `${s.title} (cont.)`);

  // ---- Per-layout builders. Each returns drafts, or null when the content cannot fill the layout. ----------

  const bulletTexts = (s: AiSlide): { texts: string[]; dropped: string[] } => {
    const items = s.content ?? [];
    // Concise decks keep essential points; dropped detail moves to the speaker notes instead of vanishing.
    if (options.density === "concise" && items.length > 3) {
      const keep = items.filter((c) => c.importance !== "low");
      if (keep.length >= 2 && keep.length < items.length) {
        return { texts: keep.map((c) => c.text), dropped: items.filter((c) => c.importance === "low").map((c) => c.text) };
      }
    }
    return { texts: items.map((c) => c.text), dropped: [] };
  };

  const bullets = (s: AiSlide, texts: string[]): Draft[] | null => {
    if (!texts.length) return null;
    // One or two long passages read better as prose than as bullets.
    const total = texts.reduce((n, t) => n + t.length, 0);
    if (texts.length <= 2 && total > 260) {
      const pieces = texts.flatMap((t) => splitLongText(t, limits.proseChars));
      return packByLength(pieces, limits.proseChars, len).map((g, i) => ({ kind: "content" as const, title: title(s, i), paragraphs: g }));
    }
    const groups = packByLength(texts, limits.bulletChars, len, limits.bullets);
    const lead = s.keyMessage && s.keyMessage.length <= 160 && texts.length >= 2 && !texts.includes(s.keyMessage) ? s.keyMessage : undefined;
    return groups.map((g, i) => ({ kind: "bullets" as const, title: title(s, i), lead: i === 0 ? lead : undefined, bullets: g }));
  };

  /** The AI described the content as a flow or timeline: draw it as one when the items really fit. */
  const interpretVisual = (s: AiSlide, texts: string[]): Draft[] | null => {
    const kind = (s.visualSuggestion?.type ?? "").toLowerCase();
    if (texts.length < 3) return null;
    if (/timeline/.test(kind)) {
      const dated = extractTimeline(texts);
      if (dated && dated.length === texts.length) return timeline(s, dated);
    }
    if (/process|flow|steps?|sequence/.test(kind) && texts.every((t) => t.length <= 200)) return process(s, texts);
    return null;
  };

  const process = (s: AiSlide, steps: string[]): Draft[] | null => {
    if (steps.length < 2) return null;
    let start = 1;
    return balanced(steps, limits.steps).map((g, i) => {
      const draft: Draft = { kind: "process", title: title(s, i), steps: g, startAt: start };
      start += g.length;
      return draft;
    });
  };

  const timeline = (s: AiSlide, events: { date: string; text: string }[]): Draft[] | null => {
    if (events.length < 2) return null;
    return balanced(events, limits.events).map((g, i) => ({ kind: "timeline" as const, title: title(s, i), events: g }));
  };

  const twoColumns = (s: AiSlide, kind: "twoColumn" | "comparison"): Draft[] | null => {
    let cols: Column[] = (s.columns ?? []).filter((c) => c.items.length).map((c) => ({ heading: c.heading, items: c.items }));
    if (cols.length < 2) {
      const texts = bulletTexts(s).texts;
      if (texts.length < 2) return null;
      const half = Math.ceil(texts.length / 2);
      cols = [{ items: texts.slice(0, half) }, { items: texts.slice(half) }];
    }
    const [a, b] = cols;
    const rowsNeeded = Math.max(Math.ceil(a.items.length / limits.bullets), Math.ceil(b.items.length / limits.bullets));
    const out: Draft[] = [];
    for (let i = 0; i < rowsNeeded; i++) {
      const slice = (c: Column): Column => ({ heading: c.heading, items: c.items.slice(i * limits.bullets, (i + 1) * limits.bullets) });
      const left = slice(a);
      const right = slice(b);
      if (!left.items.length && !right.items.length) break;
      if (kind === "comparison") out.push({ kind: "comparison", title: title(s, i), left, right });
      else out.push({ kind: "twoColumn", title: title(s, i), columns: [left, right] });
    }
    return out;
  };

  const table = (s: AiSlide): Draft[] | null => {
    let headers: string[] | undefined;
    let rows: string[][] = [];
    const ref = s.tableRef ? blockById.get(s.tableRef) : undefined;
    if (ref && ref.type === "table") {
      headers = ref.headers;
      rows = ref.rows;
    } else if (s.table?.rows.length) {
      headers = s.table.headers?.length ? s.table.headers : undefined;
      rows = s.table.rows;
    }
    if (!rows.length && !headers) return null;
    const width = Math.max(headers?.length ?? 0, ...rows.map((r) => r.length));
    const norm = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
    const chunks = balanced(rows.map(norm), limits.tableRows);
    return (chunks.length ? chunks : [[]]).map((g, i) => ({
      kind: "table" as const,
      title: title(s, i),
      headers: headers ? norm(headers) : undefined,
      rows: g,
    }));
  };

  const chart = (s: AiSlide): Draft[] | null => {
    if (!s.chart) return null;
    const c = s.chart;
    const draft: Draft = {
      kind: "chart",
      title: s.title,
      chartType: c.chartType,
      categories: c.categories,
      series: c.series,
      unit: c.unit,
      caption: s.keyMessage,
    };
    // Bullets that came with the chart are kept on a follow-up slide.
    const extra = bulletTexts(s).texts;
    const more = extra.length ? bullets({ ...s, title: `${s.title} (details)`, keyMessage: undefined }, extra) : null;
    return [draft, ...(more ?? [])];
  };

  const imageText = (s: AiSlide): Draft[] | null => {
    const block = s.imageRef ? blockById.get(s.imageRef) : undefined;
    if (!block || block.type !== "image") return null;
    const texts = bulletTexts(s).texts;
    const fit: string[] = [];
    let used = 0;
    for (const t of texts) {
      if (fit.length && used + t.length > IMAGE_TEXT_MAX) break;
      fit.push(t);
      used += t.length;
    }
    const rest = texts.slice(fit.length);
    const main: Draft = {
      kind: "imageText",
      title: s.title,
      image: { src: block.src, alt: block.alt, width: block.width, height: block.height },
      paragraphs: [],
      bullets: fit,
    };
    const more = rest.length ? bullets({ ...s, title: `${s.title} (cont.)`, keyMessage: undefined }, rest) : null;
    return [main, ...(more ?? [])];
  };

  const takeaways = (s: AiSlide): Draft[] | null => {
    const texts = bulletTexts(s).texts;
    const pool = texts.length ? texts : s.keyMessage ? [s.keyMessage] : [];
    if (!pool.length) return null;
    return packByLength(pool, limits.bulletChars, len, Math.min(5, limits.bullets)).map((g, i) => ({
      kind: "conclusion" as const,
      title: title(s, i),
      points: g,
    }));
  };

  const quiz = (s: AiSlide): Draft[] | null => {
    const qs = s.questions?.length ? s.questions : bulletTexts(s).texts;
    if (!qs.length) return null;
    let start = 1;
    return balanced(qs, 4).map((g, i) => {
      const draft: Draft = { kind: "quiz", title: title(s, i), prompts: g, startAt: start };
      start += g.length;
      return draft;
    });
  };

  const definition = (s: AiSlide): Draft[] | null =>
    s.term && s.definition ? [{ kind: "definition", title: s.title, term: s.term, definition: s.definition }] : null;

  // ---- Walk the plan ---------------------------------------------------------------------------------------

  plan.slides.forEach((s, index) => {
    let layout = resolveLayout(s);
    const { texts, dropped } = bulletTexts(s);
    const notes = [
      s.speakerNotes,
      // The key message lives in the notes unless it became the slide's lead line.
      s.keyMessage && !["title", "section-divider", "chart", "title-content"].includes(layout) ? s.keyMessage : undefined,
      dropped.length ? `Additional points:\n${dropped.map((d) => `- ${d}`).join("\n")}` : undefined,
    ]
      .filter(Boolean)
      .join("\n\n") || undefined;

    if (layout === "title" && index > 0 && slides.length > 0) layout = "section-divider";

    if (layout === "title") {
      emit([{ kind: "cover", title: s.title, subtitle: s.keyMessage ?? plan.subtitle }], s, s.speakerNotes);
      return;
    }
    if (slides.length === 0) {
      // The first slide must be a cover; create it from the presentation title.
      slides.push({ kind: "cover", id: "s1", title: plan.presentationTitle, subtitle: plan.subtitle, sourceIds: [] });
    }
    if (layout === "section-divider") {
      currentSection = s.title;
      sectionNo++;
      emit([{ kind: "section", title: s.title, number: sectionNo }], s, s.speakerNotes);
      return;
    }

    let drafts: Draft[] | null = null;
    switch (layout) {
      case "definition":
        drafts = definition(s);
        break;
      case "two-column":
        drafts = twoColumns(s, "twoColumn");
        break;
      case "comparison":
        drafts = twoColumns(s, "comparison");
        break;
      case "text-image":
        drafts = imageText(s);
        break;
      case "process":
        drafts = process(s, s.steps?.length ? s.steps : texts);
        break;
      case "timeline":
        drafts = timeline(s, s.events?.length ? s.events : extractTimeline(texts) ?? []);
        break;
      case "chart":
        drafts = chart(s);
        break;
      case "table":
        drafts = table(s);
        break;
      case "key-takeaways":
        drafts = takeaways(s);
        break;
      case "quiz":
        drafts = quiz(s);
        break;
      case "title-content":
        drafts = interpretVisual(s, texts) ?? bullets(s, texts);
        break;
    }

    // The chosen layout could not hold the content: fall back to the plain content layout.
    if (!drafts || !drafts.length) {
      const pool = [
        ...texts,
        ...(s.steps ?? []),
        ...(s.events ?? []).map((e) => `${e.date}: ${e.text}`),
        ...(s.columns ?? []).flatMap((c) => [...(c.heading ? [c.heading] : []), ...c.items]),
        ...(s.term && s.definition ? [`${s.term}: ${s.definition}`] : []),
        ...(s.questions ?? []),
      ];
      if (!pool.length && s.keyMessage) pool.push(s.keyMessage);
      drafts = bullets(s, pool);
      if (drafts) warnings.push(`The "${layout}" layout could not be used for "${s.title}", so a plain content layout was used.`);
    }
    if (!drafts || !drafts.length) {
      warnings.push(`The slide "${s.title}" had nothing to show and was left out.`);
      return;
    }
    emit(drafts, s, notes);
  });

  if (slides.length === 0 || slides[0].kind !== "cover") {
    slides.unshift({ kind: "cover", id: "s0", title: plan.presentationTitle, subtitle: plan.subtitle, sourceIds: [] });
  }
  slides.forEach((s, i) => (s.id = `s${i + 1}`));
  if (slides[0].kind === "cover" && slides[0].title !== plan.presentationTitle && !slides[0].title.trim()) slides[0].title = plan.presentationTitle;

  // ---- Coverage --------------------------------------------------------------------------------------------
  const covered = new Set<string>(slides.flatMap((s) => s.sourceIds));
  const contentSections = sections.filter((s) =>
    s.blockIds.some((id) => {
      const b = blockById.get(id);
      return b && b.type !== "title" && b.type !== "heading" && b.type !== "unsupported";
    }),
  );
  const missed = contentSections.filter((s) => !cited.has(s.id));
  if (missed.length) {
    const names = missed.slice(0, 4).map((s) => `"${s.heading ?? s.id}"`);
    warnings.push(`The AI did not cite ${missed.length === 1 ? "this section" : `${missed.length} sections`} on any slide: ${names.join(", ")}${missed.length > 4 ? "…" : ""}. Check that nothing important is missing.`);
  }
  const coverage: CoverageReport = {
    totalBlocks: doc.blocks.length,
    assigned: doc.blocks.filter((b) => covered.has(b.id)).map((b) => b.id),
    metadata: [],
    unsupported: doc.blocks.flatMap((b) => (b.type === "unsupported" ? [{ id: b.id, reason: b.reason }] : [])),
    recovered: [],
  };

  return { title: plan.presentationTitle, subtitle: plan.subtitle, slides, coverage, warnings: uniq(warnings) };
}

