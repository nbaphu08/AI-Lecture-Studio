import { tint } from "@/lib/design/color";
import { fitFontSize } from "@/lib/design/text-utils";
import type { Slide } from "@/lib/slides/types";
import type { Shape } from "../draw";
import type { LayoutResult } from "./chrome";
import { headFont, INVERSE_DECORS, text, type Ctx } from "./shared";

type Section = Extract<Slide, { kind: "section" }>;

export function sectionLayout(slide: Section, ctx: Ctx): LayoutResult {
  const { theme, grid } = ctx;
  const { colors } = theme;
  const mx = grid.marginX;
  const inverse = INVERSE_DECORS.includes(theme.decor);
  const background = inverse ? colors.primary : colors.background;
  const titleColor = inverse ? colors.onPrimary : colors.primary;
  const shapes: Shape[] = [];
  const number = String(Math.max(1, slide.number)).padStart(2, "0");

  if (theme.decor === "corporate") {
    shapes.push({ t: "rect", x: 0, y: grid.h - 0.25, w: grid.w, h: 0.25, fill: colors.accent });
  }
  if (theme.decor === "modern") {
    shapes.push({ t: "ellipse", x: -1.5, y: grid.h - 3, w: 4.5, h: 4.5, fill: tint(colors.primary, 0.12) });
  }
  if (theme.decor === "editorial") {
    shapes.push({ t: "line", x1: mx, y1: 0.7, x2: grid.w - mx, y2: 0.7, color: colors.primary, width: 0.5 });
  }

  shapes.push(
    text(ctx, { x: mx, y: 1.3, w: 4, h: 1.6 }, [number], {
      size: ctx.sz(theme.decor === "editorial" ? 96 : 72),
      color: inverse ? colors.accent : theme.decor === "editorial" ? colors.accent : tint(colors.accent, 0.1),
      font: headFont(ctx),
      bold: theme.decor !== "editorial",
      valign: "bottom",
    }),
  );
  shapes.push({ t: "rect", x: mx, y: 3.15, w: 1.1, h: 0.06, fill: inverse ? tint(colors.primary, 0.5) : colors.accent });

  const box = { x: mx, y: 3.45, w: grid.w - mx * 2, h: 2.2 };
  const max = ctx.sz(theme.sizes.sectionTitle) * theme.titleScale;
  const { size } = fitFontSize([slide.title], { font: theme.fonts.heading, width: box.w, lineSpacing: 1.05, bold: true }, box.h, max, 22);
  shapes.push(
    text(ctx, box, [slide.title], { size, color: titleColor, font: headFont(ctx), bold: theme.decor !== "editorial", lineSpacing: 1.05 }),
  );

  if (ctx.showNumber) {
    shapes.push(
      text(ctx, { x: grid.w - mx - 1.2, y: grid.h - 0.6, w: 1.2, h: 0.3 }, [String(ctx.index + 1)], {
        size: ctx.sz(theme.sizes.label),
        color: inverse ? tint(colors.primary, 0.6) : colors.mutedText,
        align: "right",
        valign: "middle",
      }),
    );
  }
  return { shapes, background };
}
