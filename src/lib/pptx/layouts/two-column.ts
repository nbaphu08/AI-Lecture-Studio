import type { Column, Slide } from "@/lib/slides/types";
import { columns } from "@/lib/design/layout-utils";
import type { Rect } from "@/lib/design/tokens";
import { estimateHeight } from "@/lib/design/text-utils";
import type { Shape } from "../draw";
import { frame, type LayoutResult } from "./chrome";
import { card, cardColor, fit, headFont, text, type Ctx } from "./shared";

type TwoColumn = Extract<Slide, { kind: "twoColumn" }>;

/** A card with an optional heading and a bullet list. Shared by two-column and comparison layouts. */
export function columnCard(ctx: Ctx, col: Column, area: Rect, i: number, banded: boolean, size?: number): Shape[] {
  const { theme } = ctx;
  const shapes: Shape[] = [card(ctx, area)];
  const color = cardColor(ctx, i);
  let y = area.y + 0.3;
  if (col.heading && banded) {
    shapes.push({ t: "rect", x: area.x, y: area.y, w: area.w, h: 0.75, fill: color, radius: theme.radius });
    shapes.push({ t: "rect", x: area.x, y: area.y + 0.4, w: area.w, h: 0.35, fill: color });
    shapes.push(
      text(ctx, { x: area.x + 0.3, y: area.y + 0.08, w: area.w - 0.6, h: 0.6 }, [col.heading], {
        size: ctx.sz(18),
        bold: true,
        font: headFont(ctx),
        color: readable(color),
        valign: "middle",
      }),
    );
    y = area.y + 1.0;
  } else {
    shapes.push({ t: "rect", x: area.x, y: area.y, w: area.w, h: 0.08, fill: color });
    if (col.heading) {
      shapes.push(
        text(ctx, { x: area.x + 0.3, y: area.y + 0.28, w: area.w - 0.6, h: 0.55 }, [col.heading], {
          size: ctx.sz(18),
          bold: true,
          font: headFont(ctx),
          color: theme.colors.primary,
          valign: "middle",
        }),
      );
      y = area.y + 0.95;
    }
  }
  const box = { x: area.x + 0.3, y, w: area.w - 0.6, h: area.y + area.h - y - 0.25 };
  const s = size ?? fit(ctx, col.items, box, { bullet: true, max: ctx.sz(theme.sizes.body) });
  shapes.push(
    text(
      ctx,
      box,
      col.items.map((t) => ({ text: t, bullet: "dot" as const, spaceAfter: Math.round(s * 0.42) })),
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
      fit(ctx, c.items, { x: 0, y: 0, w: areas[i].w - 0.6, h: areas[i].h - (c.heading ? headerH : 0.3) - 0.25 }, {
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
        estimateHeight(c.items, { font: ctx.theme.fonts.body, size, width: areas[i].w - 0.6, lineSpacing: 1.15, indent: 0.3 }, (size / 72) * 0.42) +
        0.45,
    ),
  );
  const h = Math.min(areas[0].h, Math.max(minH, needed));
  return areas.map((a) => ({ ...a, h }));
}

export function twoColumnLayout(slide: TwoColumn, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const full = columns(body, 2, 0.45);
  const size = sharedColumnSize(ctx, slide.columns, full, 0.95);
  const areas = fitColumnAreas(ctx, slide.columns, full, 0.95, size);
  slide.columns.forEach((col, i) => shapes.push(...columnCard(ctx, col, areas[i], i, false, size)));
  return { shapes };
}
