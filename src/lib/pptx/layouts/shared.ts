import type { ResolvedTheme } from "@/lib/design/themes";
import type { Grid, Rect } from "@/lib/design/tokens";
import { fitFontSize } from "@/lib/design/text-utils";
import type { Para, Shape } from "../draw";

export interface Ctx {
  theme: ResolvedTheme;
  grid: Grid;
  showNumber: boolean;
  showLabel: boolean;
  index: number;
  total: number;
  deckTitle: string;
  /** Scale a design font size for the current aspect ratio. */
  sz: (pt: number) => number;
}

export const INVERSE_DECORS = ["academic", "modern", "corporate"];

export function bodyFont(ctx: Ctx) {
  return ctx.theme.fonts.body;
}
export function headFont(ctx: Ctx) {
  return ctx.theme.fonts.heading;
}

/** Color for the i-th card: a single accent normally, rotating when "colorful" is on. */
export function cardColor(ctx: Ctx, i: number): string {
  return ctx.theme.colorful ? ctx.theme.palette[i % ctx.theme.palette.length] : ctx.theme.colors.accent;
}

export function text(
  ctx: Ctx,
  box: Rect,
  paras: Array<string | Para>,
  o: Partial<Extract<Shape, { t: "text" }>> = {},
): Shape {
  return {
    t: "text",
    ...box,
    paras: paras.map((p) => (typeof p === "string" ? { text: p } : p)),
    size: ctx.sz(ctx.theme.sizes.body),
    color: ctx.theme.colors.text,
    font: bodyFont(ctx),
    align: "left",
    valign: "top",
    lineSpacing: 1.15,
    ...o,
  };
}

export function card(ctx: Ctx, box: Rect, o: { fill?: string; line?: boolean } = {}): Shape {
  const { colors, radius } = ctx.theme;
  return {
    t: "rect",
    ...box,
    fill: o.fill ?? colors.surface,
    line: o.line === false ? undefined : { color: colors.border, width: 0.75 },
    radius,
  };
}

/** Circle with a centered label (numbered steps, check marks…). */
export function badge(ctx: Ctx, cx: number, cy: number, d: number, label: string, fill: string, color?: string): Shape[] {
  const onFill = color ?? readable(fill);
  return [
    { t: "ellipse", x: cx - d / 2, y: cy - d / 2, w: d, h: d, fill },
    text(ctx, { x: cx - d / 2, y: cy - d / 2, w: d, h: d }, [label], {
      size: ctx.sz(Math.round(d * 34)),
      bold: true,
      color: onFill,
      font: headFont(ctx),
      align: "center",
      valign: "middle",
    }),
  ];
}

function readable(bg: string): string {
  const r = parseInt(bg.slice(0, 2), 16);
  const g = parseInt(bg.slice(2, 4), 16);
  const b = parseInt(bg.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "1F2937" : "FFFFFF";
}

export interface FitOptions {
  max?: number;
  min?: number;
  bullet?: boolean;
  bold?: boolean;
  lineSpacing?: number;
  font?: string;
}

/** Choose the biggest font size at which the texts fit the box (never below `min`). */
export function fit(ctx: Ctx, texts: string[], box: Rect, o: FitOptions = {}): number {
  const max = o.max ?? ctx.sz(ctx.theme.sizes.body);
  const min = o.min ?? 12;
  return fitFontSize(
    texts,
    {
      font: o.font ?? bodyFont(ctx),
      width: box.w,
      lineSpacing: o.lineSpacing ?? 1.15,
      indent: o.bullet ? 0.3 : 0,
      bold: o.bold,
    },
    box.h,
    max,
    min,
  ).size;
}
