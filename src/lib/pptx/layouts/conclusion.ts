import type { Slide } from "@/lib/slides/types";
import { readableOn } from "@/lib/design/color";
import { frame, frameBackground, type LayoutResult } from "./chrome";
import { badge, fit, text, type Ctx } from "./shared";

type Conclusion = Extract<Slide, { kind: "conclusion" }>;

/** Key takeaways on the theme's hero gradient, each point on a translucent "glass" card. */
export function conclusionLayout(slide: Conclusion, ctx: Ctx): LayoutResult {
  const f = frame(ctx, slide.title, slide.section, { inverse: true });
  const { shapes, body } = f;
  const { theme } = ctx;
  const on = theme.colors.onHero;
  const n = slide.points.length;
  const gap = 0.18;
  const rowH = Math.min(1.15, (body.h - gap * (n - 1)) / n);
  const d = Math.min(0.55, rowH - 0.22);
  const textX = body.x + 1.05;
  const textW = body.w - 1.4;
  const size = Math.min(...slide.points.map((p) => fit(ctx, [p], { x: 0, y: 0, w: textW, h: rowH - 0.16 }, { min: 11 })));
  const top = body.y + Math.max(0, (body.h - (rowH * n + gap * (n - 1))) * 0.3);
  // The accent stands out on the gradient, except where the gradient is built from the accent itself.
  const badgeFill = theme.decor === "editorial" ? on : theme.colors.accent;

  slide.points.forEach((p, i) => {
    const y = top + i * (rowH + gap);
    shapes.push({ t: "rect", x: body.x, y, w: body.w, h: rowH, fill: "FFFFFF", alpha: 0.88, line: { color: "FFFFFF", width: 0.75, alpha: 0.75 }, radius: theme.radius });
    shapes.push(...badge(ctx, body.x + 0.52, y + rowH / 2, d, String(i + 1), badgeFill, readableOn(badgeFill, theme.colors.gradFrom, "FFFFFF")));
    shapes.push(text(ctx, { x: textX, y: y + 0.08, w: textW, h: rowH - 0.16 }, [p], { size, valign: "middle", color: on }));
  });
  return { shapes, ...frameBackground(f) };
}
