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
  const size = sharedColumnSize(ctx, cols, full, 1.0);
  const areas = fitColumnAreas(ctx, cols, full, 1.0, size);
  const colorCtx: Ctx = { ...ctx, theme: { ...ctx.theme, colorful: true, palette: [ctx.theme.colors.primary, ctx.theme.colors.accent] } };
  cols.forEach((col, i) => shapes.push(...columnCard(colorCtx, col, areas[i], i, true, size)));
  const cx = body.x + body.w / 2;
  shapes.push(...badge(ctx, cx, areas[0].y + areas[0].h / 2, 0.7, "vs", ctx.theme.colors.text));
  return { shapes };
}
