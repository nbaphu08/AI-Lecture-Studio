import type { Slide } from "@/lib/slides/types";
import { columns } from "@/lib/design/layout-utils";
import { frame, type LayoutResult } from "./chrome";
import { badge, type Ctx } from "./shared";
import { columnCard, fitColumnAreas, sharedColumnSize } from "./two-column";

type Comparison = Extract<Slide, { kind: "comparison" }>;

export function comparisonLayout(slide: Comparison, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const gap = 0.9;
  const full = columns(body, 2, gap);
  const cols = [slide.left, slide.right];
  const size = sharedColumnSize(ctx, cols, full, 1.05);
  const areas = fitColumnAreas(ctx, cols, full, 1.05, size);
  const colorCtx: Ctx = { ...ctx, theme: { ...ctx.theme, colorful: true, palette: [ctx.theme.colors.primary, ctx.theme.colors.accent] } };
  cols.forEach((col, i) => shapes.push(...columnCard(colorCtx, col, areas[i], i, true, size)));
  const cx = body.x + body.w / 2;
  const cy = areas[0].y + areas[0].h / 2;
  const { colors } = ctx.theme;
  shapes.push({ t: "ellipse", x: cx - 0.52, y: cy - 0.52, w: 1.04, h: 1.04, fill: colors.background, line: { color: colors.border, width: 1 } });
  shapes.push(...badge(ctx, cx, cy, 0.78, "VS", ctx.theme.dark ? colors.accent : colors.heading));
  return { shapes };
}
