import type { Slide } from "@/lib/slides/types";
import { frame, type LayoutResult } from "./chrome";
import { bodyFont, card, text, type Ctx } from "./shared";

type Chart = Extract<Slide, { kind: "chart" }>;

/** A native PowerPoint chart in a card, with the key message underneath. */
export function chartLayout(slide: Chart, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const captionH = slide.caption ? 0.75 : 0;
  const area = { x: body.x, y: body.y, w: body.w, h: body.h - captionH - (slide.caption ? 0.15 : 0) };
  const colors = [theme.colors.primary, theme.colors.accent, theme.colors.secondary, ...theme.palette];

  shapes.push(card(ctx, area));
  const pad = 0.25;
  shapes.push({
    t: "chart",
    x: area.x + pad,
    y: area.y + pad,
    w: area.w - pad * 2,
    h: area.h - pad * 2,
    chartType: slide.chartType,
    categories: slide.categories,
    series: slide.series,
    colors: Array.from(new Set(colors)),
    font: bodyFont(ctx),
    size: ctx.sz(14),
    textColor: theme.colors.text,
    gridColor: theme.colors.border,
    unit: slide.unit,
    alt: `${slide.chartType} chart: ${slide.title}`,
  });
  if (slide.caption) {
    shapes.push(
      text(ctx, { x: body.x + 0.1, y: area.y + area.h + 0.15, w: body.w - 0.2, h: captionH }, [slide.caption], {
        size: ctx.sz(16),
        color: theme.colors.mutedText,
        valign: "middle",
      }),
    );
  }
  return { shapes };
}
