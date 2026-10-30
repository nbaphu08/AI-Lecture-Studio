import { shade, tint } from "@/lib/design/color";
import { fitFontSize } from "@/lib/design/text-utils";
import type { Slide } from "@/lib/slides/types";
import type { Gradient, Shape } from "../draw";
import type { LayoutResult } from "./chrome";
import { blob, headFont, heroGradient, rings, text, type Ctx } from "./shared";

type Cover = Extract<Slide, { kind: "cover" }>;

export function coverLayout(slide: Cover, ctx: Ctx): LayoutResult {
  const { theme, grid } = ctx;
  const { colors } = theme;
  const { w, h } = grid;
  const mx = grid.marginX;
  const shapes: Shape[] = [];
  let background = colors.background;
  let backgroundGradient: Gradient | undefined;
  let titleColor = colors.heading;
  let subColor = colors.mutedText;
  let textX = mx;
  let textW = w - mx * 2;
  let titleTop = 1.75;
  let rule: Shape | null = null;

  switch (theme.decor) {
    case "academic": {
      background = colors.gradFrom;
      backgroundGradient = heroGradient(ctx);
      titleColor = colors.onHero;
      subColor = tint(colors.gradTo, 0.7);
      shapes.push(...rings(w - 0.9, h - 0.6, 1.6, "FFFFFF", 5, 0.5, 0.88));
      shapes.push({ t: "rect", x: 0, y: h - 0.14, w, h: 0.14, fill: colors.accent });
      shapes.push({ t: "rect", x: mx, y: 1.15, w: 0.05, h: h - 2.45, fill: colors.accent });
      textX = mx + 0.45;
      textW = w * 0.72 - textX;
      rule = { t: "rect", x: textX, y: 0, w: 1.3, h: 0.06, fill: colors.accent };
      break;
    }
    case "minimalist": {
      const r = Math.min(2.7, h * 0.36);
      shapes.push({ t: "ellipse", x: w - mx - r * 2 + 0.6, y: h / 2 - r, w: r * 2, h: r * 2, line: { color: colors.border, width: 1 } });
      shapes.push({ t: "ellipse", x: w - mx - r * 2 + 0.6 + r * 1.45, y: h / 2 - r * 0.95, w: 0.5, h: 0.5, fill: colors.accent });
      shapes.push({ t: "rect", x: mx, y: 2.15, w: 0.8, h: 0.07, fill: colors.accent });
      shapes.push({ t: "line", x1: mx, y1: h - 0.75, x2: w - mx, y2: h - 0.75, color: colors.border, width: 0.75 });
      textW = w * 0.62 - mx;
      titleTop = 2.4;
      break;
    }
    case "modern": {
      background = colors.gradFrom;
      backgroundGradient = heroGradient(ctx);
      titleColor = colors.onHero;
      subColor = tint(colors.gradFrom, 0.78);
      shapes.push(blob(w - 1.2, h - 0.6, 3.2, "FFFFFF", 0.9));
      shapes.push(blob(w - 2.6, h - 2.4, 1.5, "FFFFFF", 0.86));
      shapes.push({ t: "ellipse", x: w - 2.4, y: -0.8, w: 2.4, h: 2.4, fill: colors.accent, gradient: { from: colors.accent, to: tint(colors.accent, 0.35), angle: 45 } });
      shapes.push(...rings(w - 1.2, 0.4, 1.6, "FFFFFF", 2, 0.45, 0.85));
      textW = w * 0.66 - mx;
      rule = { t: "rect", x: textX, y: 0, w: 1.3, h: 0.1, radius: 0.05, fill: colors.accent };
      break;
    }
    case "corporate": {
      const edgeTop = w * 0.6;
      const edgeBottom = w * 0.5;
      shapes.push({ t: "poly", points: [[0, 0], [edgeTop, 0], [edgeBottom, h], [0, h]], fill: colors.primary, gradient: heroGradient(ctx, 120) });
      shapes.push({ t: "poly", points: [[edgeTop, 0], [edgeTop + 0.16, 0], [edgeBottom + 0.16, h], [edgeBottom, h]], fill: colors.accent });
      // A grid of tiles on the right: a quiet, geometric "business" motif.
      const tile = 0.62;
      const gap = 0.16;
      const startX = w - mx - (tile * 3 + gap * 2);
      const startY = h / 2 - (tile * 3 + gap * 2) / 2;
      const tones = [tint(colors.primary, 0.85), tint(colors.primary, 0.7), colors.accent, tint(colors.primary, 0.9), colors.secondary, tint(colors.primary, 0.8), colors.primary, tint(colors.primary, 0.88), tint(colors.accent, 0.55)];
      tones.forEach((tone, i) =>
        shapes.push({ t: "rect", x: startX + (i % 3) * (tile + gap), y: startY + Math.floor(i / 3) * (tile + gap), w: tile, h: tile, fill: tone, radius: 0.06 }),
      );
      titleColor = colors.onHero;
      subColor = tint(colors.primary, 0.75);
      textW = edgeBottom - mx - 0.4;
      rule = { t: "rect", x: textX, y: 0, w: 1.1, h: 0.07, fill: colors.accent };
      break;
    }
    case "editorial": {
      const panelX = w * 0.7;
      shapes.push({ t: "rect", x: panelX, y: 0, w: w - panelX, h, fill: colors.accent, gradient: heroGradient(ctx, 90) });
      shapes.push(...rings(panelX + (w - panelX) / 2, h / 2, 0.9, colors.onHero, 3, 0.4, 0.75));
      shapes.push({ t: "line", x1: mx, y1: 0.7, x2: panelX - 0.5, y2: 0.7, color: colors.primary, width: 2 });
      shapes.push({ t: "line", x1: mx, y1: 0.77, x2: panelX - 0.5, y2: 0.77, color: colors.primary, width: 0.5 });
      shapes.push({ t: "line", x1: mx, y1: h - 0.8, x2: panelX - 0.5, y2: h - 0.8, color: colors.primary, width: 0.5 });
      textW = panelX - 0.5 - mx;
      titleTop = 1.45;
      rule = { t: "rect", x: textX, y: 0, w: 0.9, h: 0.06, fill: colors.accent };
      break;
    }
    case "midnight": {
      background = colors.background;
      backgroundGradient = { from: colors.background, to: shade(colors.primary, 0.7), angle: 135 };
      shapes.push(blob(w - 1.6, 1.2, 2.8, colors.primary, 0.75));
      shapes.push(blob(w - 0.6, h - 0.9, 2.0, colors.accent, 0.82));
      shapes.push(blob(w - 2.9, h - 2.0, 0.9, colors.secondary, 0.7));
      shapes.push(...rings(w - 1.6, 1.2, 2.95, colors.accent, 2, 0.35, 0.82));
      textW = w * 0.64 - mx;
      rule = { t: "rect", x: textX, y: 0, w: 1.5, h: 0.07, radius: 0.035, fill: colors.accent, gradient: { from: colors.accent, to: colors.secondary, angle: 0 } };
      break;
    }
  }

  const titleBox = { x: textX, y: titleTop, w: textW, h: 2.6 };
  const maxTitle = ctx.sz(theme.sizes.coverTitle) * theme.titleScale;
  const bold = theme.decor !== "editorial";
  const fitted = fitFontSize([slide.title], { font: theme.fonts.heading, width: titleBox.w, lineSpacing: 1.05, bold }, titleBox.h, maxTitle, 24);
  shapes.push(
    text(ctx, titleBox, [slide.title], { size: fitted.size, color: titleColor, font: headFont(ctx), bold, valign: "bottom", lineSpacing: 1.02 }),
  );

  const subY = titleBox.y + titleBox.h + 0.36;
  if (rule && rule.t === "rect") shapes.push({ ...rule, y: subY - 0.2 });
  if (slide.subtitle) {
    shapes.push(
      text(ctx, { x: textX, y: subY, w: textW, h: Math.min(1.2, h - subY - 0.5) }, [slide.subtitle], {
        size: ctx.sz(theme.sizes.subtitle),
        color: subColor,
        italic: theme.decor === "editorial",
        lineSpacing: 1.2,
      }),
    );
  }
  return { shapes, background, backgroundGradient };
}
