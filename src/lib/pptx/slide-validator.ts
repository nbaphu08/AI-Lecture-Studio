import { estimateHeight } from "@/lib/design/text-utils";
import type { EffectiveSettings } from "@/lib/settings";
import { splitSlide } from "@/lib/slides/split";
import type { DeckPlan, Slide } from "@/lib/slides/types";
import { composeDeck } from "./compose";
import type { ComposedDeck, Shape } from "./draw";

/** Automatic inspection of a composed deck, and repair of what can be repaired. */

export type IssueCode = "overflow" | "out-of-bounds" | "overlap" | "empty-slide" | "missing-title" | "invalid-size" | "small-font" | "dense";

export interface LayoutIssue {
  /** 0-based slide index. */
  slide: number;
  code: IssueCode;
  severity: "error" | "warning";
  message: string;
}

const EPS = 0.01;
const MIN_READABLE_PT = 11;
const DENSE_CHARS = 1_100;

type TextShape = Extract<Shape, { t: "text" }>;

function box(s: Shape): { x: number; y: number; w: number; h: number } | null {
  switch (s.t) {
    case "line":
      return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    case "poly": {
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    case "table":
      return { x: s.x, y: s.y, w: s.w, h: s.rowH.reduce((a, b) => a + b, 0) };
    default:
      return { x: s.x, y: s.y, w: s.w, h: s.h };
  }
}

/** Estimated height a text shape needs at its current font sizes. */
export function neededTextHeight(s: TextShape): number {
  let total = 0;
  s.paras.forEach((p, i) => {
    const size = p.size ?? s.size;
    const text = s.uppercase ? p.text.toUpperCase() : p.text;
    total += estimateHeight([text], { font: s.font, size, width: s.w, lineSpacing: s.lineSpacing ?? 1, bold: p.bold ?? s.bold, indent: p.bullet ? 0.3 : 0 });
    if (i < s.paras.length - 1) total += (p.spaceAfter ?? 0) / 72;
  });
  return total;
}

export function validateDeck(deck: ComposedDeck): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const add = (slide: number, code: IssueCode, severity: LayoutIssue["severity"], message: string) => issues.push({ slide, code, severity, message });

  if (!(deck.w > 0 && deck.h > 0)) add(0, "invalid-size", "error", "The slide size is invalid.");

  deck.slides.forEach((slide, i) => {
    if (!slide.title.trim()) add(i, "missing-title", "error", "This slide has no title.");

    const texty = slide.shapes.filter((s) => s.t === "text" || s.t === "table" || s.t === "image" || s.t === "chart");
    const hasContent = texty.some((s) => (s.t === "text" ? s.paras.some((p) => p.text.trim()) : true));
    if (!hasContent) add(i, "empty-slide", "error", "This slide is empty.");

    let chars = 0;
    const texts: TextShape[] = [];
    for (const s of slide.shapes) {
      const b = box(s);
      if (!b || ![b.x, b.y, b.w, b.h].every(Number.isFinite) || b.w < 0 || b.h < 0) {
        add(i, "invalid-size", "error", "A shape has an invalid position or size.");
        continue;
      }
      // Decorative ellipses are allowed to bleed off the slide.
      if (s.t !== "ellipse" && (b.x < -EPS || b.y < -EPS || b.x + b.w > deck.w + EPS || b.y + b.h > deck.h + EPS)) {
        add(i, "out-of-bounds", "error", "Part of this slide's content extends beyond the slide edge.");
      }
      if (s.t === "text") {
        const real = s.paras.some((p) => p.text.trim());
        if (!real) continue;
        texts.push(s);
        chars += s.paras.reduce((n, p) => n + p.text.length, 0);
        const needed = neededTextHeight(s);
        if (needed > s.h * 1.08 + 0.05) add(i, "overflow", "error", "The text is too long for its box.");
        const smallest = Math.min(s.size, ...s.paras.map((p) => p.size ?? s.size));
        if (smallest < MIN_READABLE_PT && s.paras.some((p) => p.text.length > 24)) add(i, "small-font", "warning", "Some text is smaller than 11 pt.");
      }
    }

    // Two text boxes that substantially cover each other.
    for (let a = 0; a < texts.length; a++) {
      for (let c = a + 1; c < texts.length; c++) {
        const p = texts[a];
        const q = texts[c];
        const w = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
        const h = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
        if (w > 0.05 && h > 0.05 && (w * h) / Math.min(p.w * p.h, q.w * q.h) > 0.25) {
          add(i, "overlap", "warning", "Two pieces of text overlap.");
        }
      }
    }
    if (chars > DENSE_CHARS) add(i, "dense", "warning", "This slide has a lot of text.");
  });
  return issues;
}

export interface FitResult {
  plan: DeckPlan;
  deck: ComposedDeck;
  issues: LayoutIssue[];
  /** How many slides were split to resolve overflow. */
  splits: number;
}

/**
 * Compose the plan; wherever text overflows, split that slide into two and compose again. Slides
 * that cannot be split keep their (readable-size) text and are reported instead of being shrunk further.
 */
export function composeValidated(plan: DeckPlan, settings: EffectiveSettings, maxRounds = 4): FitResult {
  let current = plan;
  let splits = 0;
  for (let round = 0; ; round++) {
    const deck = composeDeck(current, settings);
    const issues = validateDeck(deck);
    const overflowing = Array.from(new Set(issues.filter((x) => x.code === "overflow" || x.code === "dense").map((x) => x.slide))).sort((a, b) => b - a);
    if (round >= maxRounds || overflowing.length === 0) return { plan: current, deck, issues, splits };

    const slides: Slide[] = [...current.slides];
    let changed = false;
    for (const index of overflowing) {
      const parts = splitSlide(slides[index]);
      if (parts) {
        slides.splice(index, 1, ...parts);
        splits++;
        changed = true;
      }
    }
    if (!changed) return { plan: current, deck, issues, splits };
    slides.forEach((s, i) => (s.id = `s${i + 1}`));
    current = { ...current, slides };
  }
}

/** User-facing sentences for issues that remain after repair. */
export function issueWarnings(plan: DeckPlan, issues: LayoutIssue[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    if (issue.code === "dense") continue; // informational only
    const key = `${issue.slide}:${issue.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = plan.slides[issue.slide]?.title ?? "";
    out.push(`Slide ${issue.slide + 1}${title ? ` (“${title}”)` : ""}: ${issue.message} Check it in PowerPoint.`);
  }
  return out;
}
