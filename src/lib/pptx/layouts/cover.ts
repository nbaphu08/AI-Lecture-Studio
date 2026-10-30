import { mix, tint } from "@/lib/design/color";
import { fitFontSize } from "@/lib/design/text-utils";
import type { Slide } from "@/lib/slides/types";
import type { Shape } from "../draw";
import type { LayoutResult } from "./chrome";
import { headFont, text, type Ctx } from "./shared";

type Cover = Extract<Slide, { kind: "cover" }>;

export function coverLayout(slide: Cover, ctx: Ctx): LayoutResult {
  const { theme, grid } = ctx;
  const { colors } = theme;
  const mx = grid.marginX;
  const shapes: Shape[] = [];
  const inverse = theme.decor === "academic" || theme.decor === "modern";
  const background = inverse ? colors.primary : colors.background;
  const titleColor = inverse ? colors.onPrimary : colors.primary;
  const subColor = inverse ? tint(colors.primary, 0.75) : colors.mutedText;

  let textX = mx;
  let textW = grid.w - mx * 2;

  switch (theme.decor) {
    case "academic":
      shapes.push({ t: "rect", x: 0, y: grid.h - 0.35, w: grid.w, h: 0.35, fill: colors.accent });
      shapes.push({ t: "rect", x: mx, y: 1.0, w: 0.06, h: grid.h - 2.2, fill: tint(colors.primary, 0.35) });
      textX = mx + 0.45;
      textW -= 0.45;
      break;
    case "modern":
      shapes.push({ t: "ellipse", x: grid.w - 4.2, y: grid.h - 3.9, w: 5.6, h: 5.6, fill: mix(colors.primary, "FFFFFF", 0.14) });
      shapes.push({ t: "ellipse", x: grid.w - 2.3, y: -0.9, w: 2.6, h: 2.6, fill: colors.accent });
      textW = grid.w * 0.68 - mx;
      break;
    case "corporate": {
      const panelW = grid.w * 0.34;
      shapes.push({ t: "rect", x: 0, y: 0, w: panelW, h: grid.h, fill: colors.primary });
      shapes.push({ t: "rect", x: panelW, y: 0, w: 0.1, h: grid.h, fill: colors.accent });
      shapes.push({ t: "rect", x: mx, y: grid.h - 1.6, w: 0.9, h: 0.9, fill: tint(colors.primary, 0.18), radius: theme.radius });
      shapes.push({ t: "rect", x: mx + 0.5, y: grid.h - 1.1, w: 0.9, h: 0.9, fill: colors.accent, radius: theme.radius });
      textX = panelW + 0.7;
      textW = grid.w - textX - mx;
      break;
    }
    case "minimalist":
      shapes.push({ t: "rect", x: mx, y: 2.1, w: 0.8, h: 0.07, fill: colors.accent });
      textW = grid.w * 0.78;
      break;
    case "editorial":
      shapes.push({ t: "line", x1: mx, y1: 0.7, x2: grid.w - mx, y2: 0.7, color: colors.primary, width: 2 });
      shapes.push({ t: "line", x1: mx, y1: 0.77, x2: grid.w - mx, y2: 0.77, color: colors.primary, width: 0.5 });
      shapes.push({ t: "line", x1: mx, y1: grid.h - 0.8, x2: grid.w - mx, y2: grid.h - 0.8, color: colors.primary, width: 0.5 });
      break;
  }

  const titleTop = theme.decor === "minimalist" ? 2.45 : theme.decor === "editorial" ? 1.6 : 1.7;
  const titleBox = { x: textX, y: titleTop, w: textW, h: 2.6 };
  const maxTitle = ctx.sz(theme.sizes.coverTitle) * theme.titleScale;
  const fitted = fitFontSize([slide.title], { font: theme.fonts.heading, width: titleBox.w, lineSpacing: 1.05, bold: true }, titleBox.h, maxTitle, 24);
  shapes.push(
    text(ctx, titleBox, [slide.title], {
      size: fitted.size,
      color: titleColor,
      font: headFont(ctx),
      bold: theme.decor !== "editorial",
      valign: "bottom",
      lineSpacing: 1.05,
    }),
  );

  const subY = titleBox.y + titleBox.h + 0.3;
  if (slide.subtitle) {
    shapes.push(
      text(ctx, { x: textX, y: subY, w: textW, h: 1.0 }, [slide.subtitle], {
        size: ctx.sz(theme.sizes.subtitle),
        color: subColor,
        italic: theme.decor === "editorial",
      }),
    );
  }
  if (theme.decor === "academic" || theme.decor === "modern") {
    shapes.push({ t: "rect", x: textX, y: subY - 0.17, w: 1.3, h: 0.06, fill: colors.accent });
  }
  return { shapes, background };
}
