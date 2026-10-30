import type { DocumentBlock, ParsedDocument } from "@/lib/docx/types";
import { titleFromFileName } from "@/lib/utils/file-utils";
import {
  COMPARISON_TITLE,
  CONCLUSION_TITLE,
  extractDefinedSubject,
  extractDefinition,
  extractLeadingDate,
  extractSequenceSteps,
  extractTimeline,
  packByLength,
  splitComparison,
  splitLongText,
  splitSentences,
  stripStepPrefix,
  wordCount,
} from "./content-analysis";
import type { Column, CoverageReport, DeckPlan, Density, PlannerOptions, Slide, SlideImage } from "./types";

interface Params {
  bullets: number;
  bulletChars: number;
  proseChars: number;
  steps: number;
  events: number;
  tableRows: number;
}

const PARAMS: Record<Density, Params> = {
  concise: { bullets: 4, bulletChars: 360, proseChars: 300, steps: 4, events: 4, tableRows: 5 },
  balanced: { bullets: 6, bulletChars: 640, proseChars: 520, steps: 5, events: 5, tableRows: 7 },
  detailed: { bullets: 8, bulletChars: 900, proseChars: 780, steps: 6, events: 6, tableRows: 9 },
};

/** Longest text that may sit next to an image before the image gets its own slide. */
const IMAGE_TEXT_MAX = 460;
const LONG_ITEM = 300;
const MAX_STEP_CHARS = 220;

type Draft = Slide extends infer S ? (S extends Slide ? Omit<S, "id" | "sourceIds" | "section"> : never) : never;

interface Piece {
  text: string;
  id: string;
}

type Item =
  | { kind: "para"; piece: Piece; leadBold?: string }
  | { kind: "list"; ordered: boolean; pieces: Piece[] };

interface Node {
  heading?: { id: string; text: string };
  level: number;
  blocks: DocumentBlock[];
  children: Node[];
}

const unique = (ids: string[]) => Array.from(new Set(ids));
const chars = (items: Item[]) =>
  items.reduce((n, it) => n + (it.kind === "para" ? it.piece.text.length : it.pieces.reduce((m, p) => m + p.text.length, 0)), 0);

export function planSlides(doc: ParsedDocument, options: PlannerOptions): DeckPlan {
  const p = PARAMS[options.density];
  const preferDiagrams = !!options.preferDiagrams;
  const minSteps = preferDiagrams ? 2 : 3;
  const slides: Slide[] = [];
  const pendingHeadings: string[] = [];
  const covered = new Set<string>();
  let section: string | undefined;
  let sectionNo = 0;

  const push = (draft: Draft, ids: string[]) => {
    const sourceIds = unique([...pendingHeadings.splice(0), ...ids]);
    sourceIds.forEach((id) => covered.add(id));
    slides.push({ ...draft, id: `s${slides.length + 1}`, sourceIds, section } as Slide);
  };

  // ---- Title and cover -------------------------------------------------------------------
  const blocks = doc.blocks;
  const titleBlock = blocks.find((b) => b.type === "title");
  const h1s = blocks.filter((b) => b.type === "heading" && b.level === 1);
  const firstContentIdx = blocks.findIndex((b) => b.type !== "title");

  let title: string;
  let titleId: string | undefined;
  let shift = 0;
  if (titleBlock && titleBlock.type === "title") {
    title = titleBlock.text;
    titleId = titleBlock.id;
  } else if (h1s.length === 1 && h1s[0].type === "heading" && blocks.indexOf(h1s[0]) <= firstContentIdx + 1) {
    title = h1s[0].text;
    titleId = h1s[0].id;
    shift = 1;
  } else {
    title = options.fileName ? titleFromFileName(options.fileName) : "Presentation";
  }

  const consumed = new Set<string>(titleId ? [titleId] : []);
  let subtitle: string | undefined;
  if (titleId) {
    const next = blocks[blocks.findIndex((b) => b.id === titleId) + 1];
    if (next && next.type === "paragraph" && (next.subtitle || (next.text.length <= 120 && !/[.!?:]$/.test(next.text)))) {
      subtitle = next.text;
      consumed.add(next.id);
    }
  }

  // ---- Build heading tree ----------------------------------------------------------------
  const root: Node = { level: 0, blocks: [], children: [] };
  const stack: Node[] = [root];
  for (const block of blocks) {
    if (consumed.has(block.id)) continue;
    if (block.type === "heading") {
      const level = Math.max(1, block.level - shift);
      while (stack[stack.length - 1].level >= level) stack.pop();
      const node: Node = { heading: { id: block.id, text: block.text }, level, blocks: [], children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      stack[stack.length - 1].blocks.push(block);
    }
  }

  const useDividers = root.children.filter((n) => n.level === 1).length >= 3;

  push({ kind: "cover", title, subtitle }, [...consumed]);

  // ---- Text -> slides ----------------------------------------------------------------------
  const toBullets = (items: Item[], detailed: boolean): Piece[] => {
    const out: Piece[] = [];
    for (const it of items) {
      if (it.kind === "list") {
        for (const piece of it.pieces) {
          splitLongText(piece.text, LONG_ITEM).forEach((t) => out.push({ text: t, id: piece.id }));
        }
      } else {
        const text = it.piece.text;
        const parts = detailed ? splitLongText(text, LONG_ITEM) : splitSentences(text);
        parts.forEach((t) => out.push({ text: t, id: it.piece.id }));
      }
    }
    return out;
  };

  const chunkBullets = (pieces: Piece[]): Piece[][] => packByLength(pieces, p.bulletChars, (x) => x.text.length, p.bullets);

  const emitText = (items: Item[], title: () => string, conclusion: boolean) => {
    if (items.length === 0) return;
    const detailed = options.density === "detailed";

    if (conclusion) {
      const pieces = toBullets(items, detailed);
      packByLength(pieces, p.bulletChars, (x) => x.text.length, Math.min(5, p.bullets)).forEach((group) =>
        push({ kind: "conclusion", title: title(), points: group.map((g) => g.text) }, group.map((g) => g.id)),
      );
      return;
    }

    const hasList = items.some((i) => i.kind === "list");
    if (!hasList) {
      const paras = items.map((i) => (i as Extract<Item, { kind: "para" }>).piece);
      const sentenceCount = paras.reduce((n, para) => n + splitSentences(para.text).length, 0);
      if (detailed || sentenceCount <= 2) {
        // Keep prose as paragraphs; split oversized ones only at sentence boundaries.
        const pieces = paras.flatMap((para) => splitLongText(para.text, p.proseChars).map((text) => ({ text, id: para.id })));
        packByLength(pieces, p.proseChars, (x) => x.text.length).forEach((group) =>
          push({ kind: "content", title: title(), paragraphs: group.map((g) => g.text) }, group.map((g) => g.id)),
        );
        return;
      }
    }

    let lead: Piece | undefined;
    let rest = items;
    const first = items[0];
    if (first.kind === "para" && items.length > 1 && items[1].kind === "list" && first.piece.text.length <= LONG_ITEM) {
      lead = first.piece;
      rest = items.slice(1);
    }
    const numbered = rest.length > 0 && rest.every((i) => i.kind === "list" && i.ordered);
    const groups = chunkBullets(toBullets(rest, detailed));
    groups.forEach((group, gi) => {
      const ids = [...group.map((g) => g.id), ...(gi === 0 && lead ? [lead.id] : [])];
      const texts = group.map((g) => g.text);
      const allShort = texts.every((t) => t.length <= 80);
      if (texts.length >= 6 && allShort && !lead && !numbered && options.density !== "concise") {
        const half = Math.ceil(texts.length / 2);
        push({ kind: "twoColumn", title: title(), columns: [{ items: texts.slice(0, half) }, { items: texts.slice(half) }] }, ids);
      } else {
        push({ kind: "bullets", title: title(), lead: gi === 0 ? lead?.text : undefined, bullets: texts, numbered: numbered || undefined }, ids);
      }
    });
  };

  const emitProcess = (steps: Piece[], title: () => string) => {
    let start = 1;
    packByLength(steps, Infinity, () => 0, p.steps).forEach((group) => {
      push({ kind: "process", title: title(), steps: group.map((g) => g.text), startAt: start }, group.map((g) => g.id));
      start += group.length;
    });
  };

  const emitTimeline = (events: { date: string; text: string; id: string }[], title: () => string) => {
    packByLength(events, Infinity, () => 0, p.events).forEach((group) =>
      push({ kind: "timeline", title: title(), events: group.map(({ date, text }) => ({ date, text })) }, group.map((g) => g.id)),
    );
  };

  const emitTable = (b: Extract<DocumentBlock, { type: "table" }>, title: () => string) => {
    const chunks = packByLength(b.rows, Infinity, () => 0, p.tableRows);
    (chunks.length ? chunks : [[]]).forEach((rows) => push({ kind: "table", title: title(), headers: b.headers, rows }, [b.id]));
  };

  const planBlocks = (list: DocumentBlock[], baseTitle: string, conclusion: boolean) => {
    let used = 0;
    const title = () => (used++ === 0 ? baseTitle : `${baseTitle} (cont.)`);
    let buffer: Item[] = [];
    const flush = () => {
      emitText(buffer, title, conclusion);
      buffer = [];
    };
    const asPiece = (b: DocumentBlock & { type: "paragraph" }): Piece => ({ text: b.text, id: b.id });

    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.type === "table") {
        flush();
        emitTable(b, title);
      } else if (b.type === "image") {
        const image: SlideImage = { src: b.src, alt: b.alt, width: b.width, height: b.height };
        // Prefer the text right after an image (usually its caption/explanation), else short text before it.
        let textItems: Item[] = [];
        const next = list[i + 1];
        const nextItem = next && (next.type === "paragraph" || (next.type === "list" && !next.ordered)) ? toItem(next) : undefined;
        const nextFits =
          nextItem && chars([nextItem]) <= IMAGE_TEXT_MAX && !(nextItem.kind === "para" && extractLeadingDate(nextItem.piece.text));
        if (nextFits) {
          flush();
          textItems = [nextItem];
          i++;
        } else if (buffer.length > 0 && chars(buffer) <= IMAGE_TEXT_MAX / 2) {
          textItems = buffer;
          buffer = [];
        } else {
          flush();
        }
        const paragraphs = textItems.flatMap((t) => (t.kind === "para" ? [t.piece.text] : []));
        const bullets = textItems.flatMap((t) => (t.kind === "list" ? t.pieces.map((x) => x.text) : []));
        const ids = [b.id, ...textItems.flatMap((t) => (t.kind === "para" ? [t.piece.id] : t.pieces.map((x) => x.id)))];
        push({ kind: "imageText", title: title(), image, paragraphs, bullets }, ids);
      } else if (b.type === "list") {
        const pieces = b.items.map((text) => ({ text, id: b.id }));
        const dated = !conclusion ? extractTimeline(b.items) : null;
        if (!conclusion && dated && dated.length >= 3) {
          flush();
          emitTimeline(dated.map((d) => ({ ...d, id: b.id })), title);
        } else if (!conclusion && b.ordered && b.items.length >= minSteps && b.items.every((t) => t.length <= MAX_STEP_CHARS)) {
          flush();
          emitProcess(pieces, title);
        } else {
          buffer.push({ kind: "list", ordered: b.ordered, pieces });
        }
      } else if (b.type === "paragraph") {
        if (!conclusion) {
          // Run of consecutive paragraphs that are explicit steps or dated events.
          let j = i;
          while (j < list.length && list[j].type === "paragraph") j++;
          const run = list.slice(i, j) as (DocumentBlock & { type: "paragraph" })[];
          let n = 0;
          while (n < run.length && stripStepPrefix(run[n].text) !== null) n++;
          if (n >= minSteps) {
            flush();
            emitProcess(run.slice(0, n).map((r) => ({ text: stripStepPrefix(r.text) as string, id: r.id })), title);
            i += n - 1;
            continue;
          }
          let d = 0;
          while (d < run.length && extractLeadingDate(run[d].text)) d++;
          if (d >= 3) {
            flush();
            emitTimeline(run.slice(0, d).map((r) => ({ ...(extractLeadingDate(r.text) as { date: string; text: string }), id: r.id })), title);
            i += d - 1;
            continue;
          }
          const sequence = extractSequenceSteps(b.text, minSteps);
          if (sequence && sequence.length >= minSteps) {
            flush();
            emitProcess(sequence.map((text) => ({ text, id: b.id })), title);
            continue;
          }
          const sentenceEvents = extractTimeline(splitSentences(b.text));
          if (sentenceEvents && sentenceEvents.length >= 3) {
            flush();
            emitTimeline(sentenceEvents.map((e) => ({ ...e, id: b.id })), title);
            continue;
          }
          const comparison = splitComparison(b.text);
          if (comparison) {
            flush();
            push(
              { kind: "comparison", title: title(), left: { items: comparison.left }, right: { items: comparison.right } },
              [b.id],
            );
            continue;
          }
        }
        buffer.push({ kind: "para", piece: asPiece(b), leadBold: b.leadBold });
      }
      // headings inside a body list and "unsupported" blocks are handled by the coverage report.
    }
    flush();
  };

  function toItem(b: DocumentBlock): Item | undefined {
    if (b.type === "paragraph") return { kind: "para", piece: { text: b.text, id: b.id }, leadBold: b.leadBold };
    if (b.type === "list") return { kind: "list", ordered: b.ordered, pieces: b.items.map((text) => ({ text, id: b.id })) };
    return undefined;
  }

  // ---- Node (heading) -> slides ------------------------------------------------------------
  const flattenToStrings = (node: Node): { texts: string[]; ids: string[] } | null => {
    if (node.children.length || node.blocks.some((b) => b.type !== "paragraph" && b.type !== "list")) return null;
    // Content with its own diagram pattern (dates, steps, contrasts) keeps its dedicated layout.
    if (node.blocks.filter((b) => b.type === "paragraph").length > 1) return null;
    const special = node.blocks.some(
      (b) =>
        (b.type === "paragraph" && (splitComparison(b.text) || extractLeadingDate(b.text) || stripStepPrefix(b.text))) ||
        (b.type === "list" && b.ordered),
    );
    if (special) return null;
    const texts: string[] = [];
    const ids: string[] = [];
    for (const b of node.blocks) {
      if (b.type === "paragraph") splitSentences(b.text).forEach((t) => (texts.push(t), ids.push(b.id)));
      else if (b.type === "list") b.items.forEach((t) => (texts.push(t), ids.push(b.id)));
    }
    return texts.length ? { texts, ids } : null;
  };

  const emitFromChildren = (node: Node, label: string): boolean => {
    if (node.blocks.length > 0 || node.children.length !== 2 || !node.heading) return false;
    const [a, b] = node.children;
    const fa = flattenToStrings(a);
    const fb = flattenToStrings(b);
    if (!fa || !fb || !a.heading || !b.heading) return false;
    const toCol = (n: Node, f: { texts: string[] }): Column => ({ heading: n.heading!.text, items: f.texts });
    const ids = [a.heading.id, b.heading.id, ...fa.ids, ...fb.ids];
    if (COMPARISON_TITLE.test(node.heading.text) && fa.texts.length <= p.bullets && fb.texts.length <= p.bullets) {
      push({ kind: "comparison", title: label, left: toCol(a, fa), right: toCol(b, fb) }, ids);
      return true;
    }
    const small = (f: { texts: string[] }) => f.texts.length <= 4 && f.texts.join(" ").length <= 320;
    if (small(fa) && small(fb)) {
      push({ kind: "twoColumn", title: label, columns: [toCol(a, fa), toCol(b, fb)] }, ids);
      return true;
    }
    return false;
  };

  const emitDefinition = (node: Node): boolean => {
    const only = node.blocks[0];
    if (!node.heading || node.blocks.length !== 1 || node.children.length || only.type !== "paragraph") return false;
    const text = only.text;
    // Contrasts, sequences and dated events have more specific layouts.
    if (splitComparison(text) || extractSequenceSteps(text, minSteps) || extractLeadingDate(text)) return false;
    const explicit = extractDefinition(text, only.leadBold);
    if (explicit && text.length <= 450) {
      push({ kind: "definition", title: node.heading.text, term: explicit.term, definition: explicit.definition }, [only.id]);
      return true;
    }
    const generic = /^(introduction|overview|background|abstract|references?|acknowledg|methods?|methodology|results?|discussion|conclusion|summary|agenda)/i;
    const sentences = splitSentences(text).length;
    const short = text.length >= 40 && text.length <= 320 && sentences <= 2;
    const headingWords = wordCount(node.heading.text);
    const defines = extractDefinedSubject(text) !== null;
    if (short && headingWords <= 5 && !generic.test(node.heading.text) && (node.level >= 2 || defines)) {
      push({ kind: "definition", title: node.heading.text, term: node.heading.text, definition: text }, [only.id]);
      return true;
    }
    return false;
  };

  const emitNode = (node: Node) => {
    const heading = node.heading!;
    const topLevel = node.level === 1;
    if (topLevel) {
      section = heading.text;
      sectionNo++;
    }
    const isConclusion = CONCLUSION_TITLE.test(heading.text);
    const nothing = node.blocks.length === 0 && node.children.length === 0;

    if (topLevel && (useDividers || nothing)) {
      push({ kind: "section", title: heading.text, number: sectionNo }, [heading.id]);
    } else if (nothing) {
      push({ kind: "section", title: heading.text, number: sectionNo }, [heading.id]);
    } else {
      pendingHeadings.push(heading.id);
    }

    if (emitFromChildren(node, heading.text)) return;
    if (!isConclusion && emitDefinition(node)) return;
    planBlocks(node.blocks, heading.text, isConclusion);
    node.children.forEach(emitNode);
  };

  // Introductory material before the first heading.
  if (root.blocks.length > 0) {
    planBlocks(root.blocks, root.children.length > 0 ? "Overview" : title, false);
  }
  root.children.forEach(emitNode);

  // Attach trailing headings (e.g. a final empty heading) to the last slide.
  if (pendingHeadings.length) {
    const last = slides[slides.length - 1];
    last.sourceIds = unique([...last.sourceIds, ...pendingHeadings.splice(0)]);
    last.sourceIds.forEach((id) => covered.add(id));
  }

  // ---- Coverage safety net ------------------------------------------------------------------
  const unsupported: CoverageReport["unsupported"] = [];
  const recovered: string[] = [];
  for (const block of blocks) {
    if (covered.has(block.id)) continue;
    if (block.type === "unsupported") {
      unsupported.push({ id: block.id, reason: block.reason });
      continue;
    }
    recovered.push(block.id);
    const before = slides.length;
    if (block.type === "heading" || block.type === "title") {
      push({ kind: "section", title: block.text, number: sectionNo }, [block.id]);
    } else {
      planBlocks([block], "Additional content", false);
    }
    if (slides.length === before) unsupported.push({ id: block.id, reason: "No slide could be created for this content." });
  }

  const assigned = blocks.filter((b) => covered.has(b.id)).map((b) => b.id);
  const warnings = [...doc.warnings];
  if (recovered.length) warnings.push(`${recovered.length} piece(s) of content were placed on plain slides because no better layout applied.`);

  return {
    title,
    subtitle,
    slides,
    coverage: { totalBlocks: blocks.length, assigned, metadata: [], unsupported, recovered },
    warnings,
  };
}
