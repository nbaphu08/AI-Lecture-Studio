import { mix, shade, tint } from "@/lib/design/color";
import { fitFontSize } from "@/lib/design/text-utils";
import type { Slide } from "@/lib/slides/types";
import type { Gradient, Shape } from "../draw";
import type { LayoutResult } from "./chrome";
import { blob, headFont, heroGradient, rings, text, type Ctx } from "./shared";

type Section = Extract<Slide, { kind: "section" }>;

export function sectionLayout(slide: Section, ctx: Ctx): LayoutResult {
  const { theme, grid } = ctx;
  const { colors } = theme;
  const { w, h } = grid;
  const mx = grid.marginX;
  const shapes: Shape[] = [];
  const number = String(Math.max(1, slide.number)).padStart(2, "0");
  const light = theme.decor === "minimalist";

  let background = colors.background;
  let backgroundGradient: Gradient | undefined;
  let titleColor = colors.heading;
  let numberColor = mix(colors.border, colors.background, 0.4);
  let numberAlpha = 0;
  let labelColor = colors.accent;
  let barColor = colors.accent;

  if (!light) {
    background = colors.gradFrom;
    backgroundGradient = theme.decor === "midnight" ? { from: colors.background, to: shade(colors.primary, 0.6), angle: 135 } : heroGradient(ctx);
    titleColor = colors.onHero;
    numberColor = "FFFFFF";
    numberAlpha = 0.88;
    labelColor = theme.decor === "editorial" ? tint(colors.gradFrom, 0.7) : theme.decor === "midnight" ? colors.accent : tint(colors.accent, 0.15);
    barColor = theme.decor === "editorial" ? colors.onHero : colors.accent;
  }

  switch (theme.decor) {
    case "academic":
      shapes.push(...rings(w - 2.2, h / 2, 2.2, "FFFFFF", 4, 0.55, 0.88));
      shapes.push({ t: "rect", x: 0, y: h - 0.14, w, h: 0.14, fill: colors.accent });
      break;
    case "modern":
      shapes.push(blob(-0.6, h + 0.2, 2.6, "FFFFFF", 0.9));
      break;
    case "corporate":
      shapes.push({ t: "poly", points: [[w * 0.62, 0], [w, 0], [w, h], [w * 0.5, h]], fill: "FFFFFF", alpha: 0.93 });
      shapes.push({ t: "rect", x: 0, y: h - 0.2, w, h: 0.2, fill: colors.accent });
      break;
    case "editorial":
      shapes.push({ t: "line", x1: mx, y1: 0.7, x2: w - mx, y2: 0.7, color: colors.onHero, width: 0.5 });
      shapes.push({ t: "line", x1: mx, y1: h - 0.7, x2: w - mx, y2: h - 0.7, color: colors.onHero, width: 0.5 });
      break;
    case "midnight":
      shapes.push(blob(w - 1.5, h / 2, 2.6, colors.primary, 0.72));
      shapes.push(blob(w - 0.7, 1.0, 1.0, colors.accent, 0.8));
      shapes.push(...rings(w - 1.5, h / 2, 2.75, colors.accent, 2, 0.4, 0.8));
      break;
    case "minimalist":
      shapes.push({ t: "line", x1: mx, y1: h - 0.75, x2: w - mx, y2: h - 0.75, color: colors.border, width: 0.75 });
      break;
  }

  // Oversized section number as a quiet ornament on the right.
  shapes.push(
    text(ctx, { x: w - mx - 6, y: 0.35, w: 6, h: 3.3 }, [number], {
      size: ctx.sz(210),
      color: numberColor,
      alpha: numberAlpha,
      font: headFont(ctx),
      bold: theme.decor !== "editorial",
      align: "right",
      valign: "top",
      lineSpacing: 0.9,
    }),
  );

  shapes.push(
    text(ctx, { x: mx, y: 2.95, w: 4, h: 0.32 }, [`Section ${number}`], {
      size: ctx.sz(theme.sizes.label) * 1.05,
      color: labelColor,
      bold: true,
      uppercase: true,
      charSpacing: 2.4,
      valign: "middle",
    }),
  );
  shapes.push({ t: "rect", x: mx, y: 3.4, w: 1.1, h: 0.07, fill: barColor, radius: theme.radius ? 0.035 : 0 });

  const box = { x: mx, y: 3.65, w: Math.min(w - mx * 2, 10.5), h: 2.3 };
  const max = ctx.sz(theme.sizes.sectionTitle) * theme.titleScale;
  const bold = theme.decor !== "editorial";
  const { size } = fitFontSize([slide.title], { font: theme.fonts.heading, width: box.w, lineSpacing: 1.05, bold }, box.h, max, 22);
  shapes.push(text(ctx, box, [slide.title], { size, color: titleColor, font: headFont(ctx), bold, lineSpacing: 1.05 }));

  if (ctx.showNumber) {
    shapes.push(
      text(ctx, { x: w - mx - 1.2, y: h - 0.62, w: 1.2, h: 0.3 }, [String(ctx.index + 1)], {
        size: ctx.sz(theme.sizes.label),
        color: light ? colors.mutedText : tint(colors.gradFrom, 0.6),
        align: "right",
        valign: "middle",
      }),
    );
  }
  return { shapes, background, backgroundGradient };
}
