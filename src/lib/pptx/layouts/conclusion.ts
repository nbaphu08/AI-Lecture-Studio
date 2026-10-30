import type { Slide } from "@/lib/slides/types";
import { mix } from "@/lib/design/color";
import { frame, type LayoutResult } from "./chrome";
import { badge, cardColor, fit, text, type Ctx } from "./shared";

type Conclusion = Extract<Slide, { kind: "conclusion" }>;

export function conclusionLayout(slide: Conclusion, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const n = slide.points.length;
  const gap = 0.18;
  const rowH = Math.min(1.2, (body.h - gap * (n - 1)) / n);
  const d = Math.min(0.55, rowH - 0.2);
  const textX = body.x + 1.0;
  const textW = body.w - 1.3;
  const size = Math.min(...slide.points.map((p) => fit(ctx, [p], { x: 0, y: 0, w: textW, h: rowH - 0.16 }, { min: 11 })));
  const tint = mix(theme.colors.primary, theme.colors.background, 0.93);

  slide.points.forEach((p, i) => {
    const y = body.y + i * (rowH + gap);
    shapes.push({ t: "rect", x: body.x, y, w: body.w, h: rowH, fill: tint, radius: theme.radius });
    shapes.push(...badge(ctx, body.x + 0.5, y + rowH / 2, d, String(i + 1), cardColor(ctx, i)));
    shapes.push(text(ctx, { x: textX, y: y + 0.08, w: textW, h: rowH - 0.16 }, [p], { size, valign: "middle" }));
  });
  return { shapes };
}
