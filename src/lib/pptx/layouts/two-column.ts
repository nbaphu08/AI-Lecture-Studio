import type { Column, Slide } from "@/lib/slides/types";
import { columns } from "@/lib/design/layout-utils";
import type { Rect } from "@/lib/design/tokens";
import { estimateHeight } from "@/lib/design/text-utils";
import type { Shape } from "../draw";
import { frame, type LayoutResult } from "./chrome";
import { card, cardColor, colorGradient, fit, headFont, text, type Ctx } from "./shared";
import { mix } from "@/lib/design/color";

type TwoColumn = Extract<Slide, { kind: "twoColumn" }>;

/** A card with an optional heading and a bullet list. Shared by two-column and comparison layouts. */
export function columnCard(ctx: Ctx, col: Column, area: Rect, i: number, banded: boolean, size?: number): Shape[] {
  const { theme } = ctx;
  const shapes: Shape[] = [card(ctx, area)];
  const color = cardColor(ctx, i);
  let y = area.y + 0.3;
  if (col.heading && banded) {
    const band = { from: color, to: mix(color, "FFFFFF", 0.22), angle: 0 };
    shapes.push({ t: "rect", x: area.x, y: area.y, w: area.w, h: 0.8, fill: color, gradient: band, radius: theme.radius });
    if (theme.radius) shapes.push({ t: "rect", x: area.x, y: area.y + 0.4, w: area.w, h: 0.4, fill: color, gradient: band });
    shapes.push(
      text(ctx, { x: area.x + 0.35, y: area.y + 0.08, w: area.w - 0.7, h: 0.64 }, [col.heading], {
        size: ctx.sz(19),
        bold: true,
        font: headFont(ctx),
        color: readable(color),
        valign: "middle",
      }),
    );
    y = area.y + 1.05;
  } else {
    shapes.push({ t: "rect", x: area.x, y: area.y, w: area.w, h: 0.08, fill: color, gradient: colorGradient(color, 0) });
    if (col.heading) {
      shapes.push({ t: "rect", x: area.x + 0.35, y: area.y + 0.47, w: 0.16, h: 0.16, fill: color, radius: theme.radius ? 0.04 : 0 });
      shapes.push(
        text(ctx, { x: area.x + 0.65, y: area.y + 0.27, w: area.w - 1.0, h: 0.56 }, [col.heading], {
          size: ctx.sz(19),
          bold: true,
          font: headFont(ctx),
          color: theme.colors.heading,
          valign: "middle",
        }),
      );
      shapes.push({ t: "line", x1: area.x + 0.35, y1: area.y + 0.95, x2: area.x + area.w - 0.35, y2: area.y + 0.95, color: theme.colors.border, width: 0.75 });
      y = area.y + 1.1;
    }
  }
  const box = { x: area.x + 0.35, y, w: area.w - 0.7, h: area.y + area.h - y - 0.25 };
  const s = size ?? fit(ctx, col.items, box, { bullet: true, max: ctx.sz(theme.sizes.body) });
  shapes.push(
    text(
      ctx,
      box,
      col.items.map((t) => ({ text: t, bullet: "dot" as const, spaceAfter: Math.round(s * 0.5) })),
      { size: s },
    ),
  );
  return shapes;
}

function readable(bg: string): string {
  const r = parseInt(bg.slice(0, 2), 16);
  const g = parseInt(bg.slice(2, 4), 16);
  const b = parseInt(bg.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "1F2937" : "FFFFFF";
}

/** Same font size for both columns so they look balanced. */
export function sharedColumnSize(ctx: Ctx, cols: Column[], areas: Rect[], headerH: number): number {
  return Math.min(
    ...cols.map((c, i) =>
      fit(ctx, c.items, { x: 0, y: 0, w: areas[i].w - 0.7, h: areas[i].h - (c.heading ? headerH : 0.3) - 0.25 }, {
        bullet: true,
        max: ctx.sz(ctx.theme.sizes.body),
      }),
    ),
  );
}

/** Shrink column areas to the height their content needs (cards shouldn't be mostly empty). */
export function fitColumnAreas(ctx: Ctx, cols: Column[], areas: Rect[], headerH: number, size: number, minH = 2.3): Rect[] {
  const needed = Math.max(
    ...cols.map(
      (c, i) =>
        (c.heading ? headerH : 0.3) +
        estimateHeight(c.items, { font: ctx.theme.fonts.body, size, width: areas[i].w - 0.7, lineSpacing: 1.15, indent: 0.3 }, (size / 72) * 0.42) +
        0.45,
    ),
  );
  const h = Math.min(areas[0].h, Math.max(minH, needed));
  return areas.map((a) => ({ ...a, h }));
}

export function twoColumnLayout(slide: TwoColumn, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const full = columns(body, 2, 0.45);
  const size = sharedColumnSize(ctx, slide.columns, full, 1.1);
  const areas = fitColumnAreas(ctx, slide.columns, full, 1.1, size);
  slide.columns.forEach((col, i) => shapes.push(...columnCard(ctx, col, areas[i], i, false, size)));
  return { shapes };
}
