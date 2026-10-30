import { isDark, mix, shade, tint } from "@/lib/design/color";
import type { ResolvedTheme } from "@/lib/design/themes";
import type { Grid, Rect } from "@/lib/design/tokens";
import { fitFontSize } from "@/lib/design/text-utils";
import type { Gradient, Para, Shape } from "../draw";

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

/** Hero gradient of the theme (covers, dividers, feature panels). */
export function heroGradient(ctx: Ctx, angle = 135): Gradient {
  return { from: ctx.theme.colors.gradFrom, to: ctx.theme.colors.gradTo, angle };
}

/** A gentle gradient within one color, for badges and accent bars. */
export function colorGradient(color: string, angle = 135): Gradient {
  return { from: isDark(color) ? color : shade(color, 0.12), to: tint(color, 0.28), angle };
}

/** Background used by cards: white on light themes so the shadow carries the depth. */
export function cardFill(ctx: Ctx): string {
  const { theme } = ctx;
  return theme.look.shadow && !theme.dark ? mix(theme.colors.background, "FFFFFF", 0.7) : theme.colors.surface;
}

/** Panel with the theme's card treatment (soft shadow, glow or hairline border). */
export function card(ctx: Ctx, box: Rect, o: { fill?: string; line?: boolean; shadow?: boolean } = {}): Shape {
  const { colors, radius, look } = ctx.theme;
  const border = o.line ?? look.cardBorder;
  return {
    t: "rect",
    ...box,
    fill: o.fill ?? cardFill(ctx),
    line: border ? { color: colors.border, width: 0.75 } : undefined,
    shadow: o.shadow === false || !look.shadow ? undefined : look.shadow,
    radius,
  };
}

/** Faint concentric rings used as background ornaments. They may bleed off the slide edge. */
export function rings(cx: number, cy: number, r: number, color: string, count = 3, step = 0.55, alpha = 0.82): Shape[] {
  return Array.from({ length: count }, (_, i) => {
    const rr = r + i * step;
    return { t: "ellipse" as const, x: cx - rr, y: cy - rr, w: rr * 2, h: rr * 2, line: { color, width: 1, alpha: Math.min(0.95, alpha + i * 0.05) } };
  });
}

/** Translucent filled circle ("glow" blob). */
export function blob(cx: number, cy: number, r: number, color: string, alpha: number): Shape {
  return { t: "ellipse", x: cx - r, y: cy - r, w: r * 2, h: r * 2, fill: color, alpha };
}

/** Small uppercase label inside a pill. Returns the shapes and the pill width. */
export function pill(ctx: Ctx, x: number, y: number, label: string, fill: string, color: string, alpha = 0): { shapes: Shape[]; w: number } {
  const size = ctx.sz(ctx.theme.sizes.label) * 0.92;
  const w = Math.min(5, label.length * (size / 72) * 0.68 + 0.42);
  const h = 0.3;
  return {
    w,
    shapes: [
      { t: "rect", x, y, w, h, fill, alpha, radius: h / 2 },
      text(ctx, { x, y, w, h }, [label], { size, bold: true, color, uppercase: true, charSpacing: 1.2, align: "center", valign: "middle" }),
    ],
  };
}

/** Circle with a centered label (numbered steps, check marks…). */
export function badge(ctx: Ctx, cx: number, cy: number, d: number, label: string, fill: string, color?: string): Shape[] {
  const onFill = color ?? readable(fill);
  const { theme } = ctx;
  const flat = theme.decor === "minimalist" || theme.decor === "editorial";
  return [
    {
      t: "ellipse",
      x: cx - d / 2,
      y: cy - d / 2,
      w: d,
      h: d,
      fill,
      gradient: flat ? undefined : colorGradient(fill),
      shadow: flat ? undefined : { blur: 8, offset: 2, opacity: theme.dark ? 0.5 : 0.22, color: theme.dark ? "000000" : shade(fill, 0.4) },
    },
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
