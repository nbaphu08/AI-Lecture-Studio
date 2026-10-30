import { mix, tint } from "@/lib/design/color";
import { fitFontSize, truncate } from "@/lib/design/text-utils";
import type { Rect } from "@/lib/design/tokens";
import type { Gradient, Shape } from "../draw";
import { blob, colorGradient, headFont, heroGradient, pill, rings, text, type Ctx } from "./shared";

export interface Frame {
  shapes: Shape[];
  /** Area available to the slide's body content. */
  body: Rect;
  background?: string;
  backgroundGradient?: Gradient;
}

export interface LayoutResult {
  shapes: Shape[];
  background?: string;
  backgroundGradient?: Gradient;
}

/** Slide number, deck title and a thin progress bar. */
function footer(ctx: Ctx, inverse = false): Shape[] {
  const { grid, theme } = ctx;
  const { colors } = theme;
  const color = inverse ? tint(colors.gradFrom, 0.62) : colors.mutedText;
  const out: Shape[] = [];
  const y = grid.h - 0.52;
  const showProgress = ["academic", "modern", "corporate", "midnight"].includes(theme.decor);

  if (showProgress && ctx.total > 1) {
    const track = inverse ? tint(colors.gradFrom, 0.2) : mix(colors.border, colors.background, 0.3);
    const fill = inverse ? colors.onHero : colors.accent;
    const progressW = (grid.w * (ctx.index + 1)) / ctx.total;
    out.push({ t: "rect", x: 0, y: grid.h - 0.06, w: grid.w, h: 0.06, fill: track });
    out.push({ t: "rect", x: 0, y: grid.h - 0.06, w: progressW, h: 0.06, fill, gradient: inverse ? undefined : colorGradient(fill, 0) });
  }
  if (ctx.showNumber) {
    const label = theme.decor === "minimalist" || theme.decor === "midnight"
      ? `${String(ctx.index + 1).padStart(2, "0")} / ${String(ctx.total).padStart(2, "0")}`
      : String(ctx.index + 1);
    out.push(
      text(ctx, { x: grid.w - grid.marginX - 1.6, y, w: 1.6, h: 0.3 }, [label], {
        size: ctx.sz(theme.sizes.label),
        color,
        align: "right",
        valign: "middle",
        bold: theme.decor === "modern" || theme.decor === "corporate",
        charSpacing: theme.decor === "minimalist" ? 1 : undefined,
      }),
    );
  }
  if (["academic", "corporate", "editorial"].includes(theme.decor)) {
    out.push(
      text(ctx, { x: grid.marginX, y, w: grid.w * 0.6, h: 0.3 }, [truncate(ctx.deckTitle, 70)], {
        size: ctx.sz(theme.sizes.label),
        color,
        valign: "middle",
        italic: theme.decor === "editorial",
      }),
    );
  }
  return out;
}

function sectionLabel(ctx: Ctx, section: string | undefined, box: Rect, color: string, align: "left" | "right" = "left"): Shape[] {
  if (!ctx.showLabel || !section) return [];
  return [
    text(ctx, box, [truncate(section, 60)], {
      size: ctx.sz(ctx.theme.sizes.label),
      color,
      bold: true,
      uppercase: true,
      charSpacing: 1.8,
      align,
      valign: "middle",
      font: ctx.theme.fonts.body,
    }),
  ];
}

function titleShape(ctx: Ctx, title: string, box: Rect, color: string, valign: "top" | "bottom" | "middle", bold = true): Shape {
  const { theme } = ctx;
  const max = ctx.sz(theme.sizes.title) * theme.titleScale;
  const { size } = fitFontSize([title], { font: theme.fonts.heading, width: box.w, lineSpacing: 1.1, bold }, box.h, max, 18);
  return text(ctx, box, [title], { size, color, font: headFont(ctx), bold, valign, lineSpacing: 1.05 });
}

/**
 * The standard title area + decoration for content slides, differing per theme.
 * `inverse` puts the slide on the theme's hero gradient (used for emphasis slides such as takeaways).
 */
export function frame(ctx: Ctx, title: string, section?: string, o: { inverse?: boolean } = {}): Frame {
  const { theme, grid } = ctx;
  const { colors } = theme;
  const mx = grid.marginX;
  const cw = grid.w - mx * 2;
  const bottom = grid.h - 0.8;
  const shapes: Shape[] = [];
  let bodyTop: number;

  if (o.inverse) {
    const on = colors.onHero;
    shapes.push(...rings(grid.w - 0.6, 0.4, 1.3, on, 4, 0.6, 0.86));
    shapes.push(blob(grid.w - 1.2, grid.h + 0.4, 2.4, on, 0.94));
    shapes.push(...sectionLabel(ctx, section, { x: mx, y: 0.42, w: cw, h: 0.3 }, tint(colors.gradFrom, 0.65)));
    shapes.push(titleShape(ctx, title, { x: mx, y: 0.75, w: cw - 1.5, h: 1.05 }, on, "bottom", theme.decor !== "editorial"));
    shapes.push({ t: "rect", x: mx, y: 1.97, w: 0.9, h: 0.07, fill: on, radius: theme.radius ? 0.035 : 0 });
    shapes.push(...footer(ctx, true));
    return {
      shapes,
      body: { x: mx, y: 2.35, w: cw, h: bottom - 2.35 },
      background: colors.gradFrom,
      backgroundGradient: heroGradient(ctx),
    };
  }

  switch (theme.decor) {
    case "academic": {
      shapes.push({ t: "rect", x: 0, y: 0, w: 0.16, h: grid.h, fill: colors.primary, gradient: heroGradient(ctx, 90) });
      shapes.push(...rings(grid.w + 0.2, -0.3, 1.1, colors.primary, 3, 0.45, 0.9));
      shapes.push({ t: "rect", x: mx, y: 0.5, w: 0.13, h: 0.13, fill: colors.accent });
      shapes.push(...sectionLabel(ctx, section, { x: mx + 0.28, y: 0.41, w: cw - 0.28, h: 0.3 }, colors.secondary));
      shapes.push(titleShape(ctx, title, { x: mx, y: 0.75, w: cw - 1.4, h: 1.05 }, colors.heading, "bottom"));
      shapes.push({ t: "line", x1: mx, y1: 1.92, x2: grid.w - mx, y2: 1.92, color: colors.border, width: 1 });
      shapes.push({ t: "rect", x: mx, y: 1.89, w: 1.2, h: 0.06, fill: colors.accent });
      bodyTop = 2.22;
      break;
    }
    case "minimalist": {
      shapes.push({ t: "rect", x: mx, y: 0.62, w: 0.55, h: 0.05, fill: colors.accent });
      shapes.push(...sectionLabel(ctx, section, { x: mx + 0.8, y: 0.5, w: cw - 0.8, h: 0.3 }, colors.mutedText));
      shapes.push(titleShape(ctx, title, { x: mx, y: 0.9, w: cw, h: 1.05 }, colors.heading, "top"));
      bodyTop = 2.25;
      break;
    }
    case "modern": {
      shapes.push(blob(grid.w - 0.5, -0.2, 1.9, colors.secondary, theme.dark ? 0.8 : 0.9));
      shapes.push(blob(grid.w - 1.75, 1.05, 0.22, colors.accent, 0.2));
      if (ctx.showLabel && section) {
        shapes.push(...pill(ctx, mx, 0.42, truncate(section, 48), mix(colors.secondary, colors.background, 0.88), colors.secondary).shapes);
      }
      shapes.push(titleShape(ctx, title, { x: mx, y: 0.8, w: cw - 2.2, h: 1.05 }, colors.heading, "bottom"));
      shapes.push({ t: "rect", x: mx, y: 1.98, w: 1.0, h: 0.1, radius: 0.05, fill: colors.secondary, gradient: { from: colors.secondary, to: colors.accent, angle: 0 } });
      bodyTop = 2.38;
      break;
    }
    case "corporate": {
      shapes.push({ t: "rect", x: 0, y: 0, w: grid.w, h: 1.36, fill: colors.primary, gradient: heroGradient(ctx, 0) });
      shapes.push({ t: "poly", points: [[grid.w - 3.6, 0], [grid.w, 0], [grid.w, 1.36], [grid.w - 2.6, 1.36]], fill: "FFFFFF", alpha: 0.93 });
      shapes.push({ t: "poly", points: [[grid.w - 1.7, 0], [grid.w, 0], [grid.w, 1.36], [grid.w - 0.7, 1.36]], fill: "FFFFFF", alpha: 0.9 });
      shapes.push({ t: "rect", x: 0, y: 1.36, w: grid.w, h: 0.07, fill: colors.accent });
      shapes.push(...sectionLabel(ctx, section, { x: mx, y: 0.14, w: cw, h: 0.28 }, tint(colors.primary, 0.7)));
      shapes.push(titleShape(ctx, title, { x: mx, y: 0.42, w: cw - 1.5, h: 0.84 }, colors.onHero, "middle"));
      shapes.push({ t: "line", x1: mx, y1: grid.h - 0.62, x2: grid.w - mx, y2: grid.h - 0.62, color: colors.border, width: 0.75 });
      bodyTop = 1.8;
      break;
    }
    case "editorial": {
      shapes.push({ t: "line", x1: mx, y1: 0.5, x2: grid.w - mx, y2: 0.5, color: colors.primary, width: 1 });
      shapes.push(...sectionLabel(ctx, section, { x: mx, y: 0.6, w: cw, h: 0.3 }, colors.accent));
      shapes.push(titleShape(ctx, title, { x: mx, y: 0.92, w: cw, h: 1.05 }, colors.heading, "top", false));
      shapes.push({ t: "line", x1: mx, y1: 2.12, x2: grid.w - mx, y2: 2.12, color: colors.primary, width: 2 });
      shapes.push({ t: "line", x1: mx, y1: 2.18, x2: grid.w - mx, y2: 2.18, color: colors.primary, width: 0.5 });
      bodyTop = 2.5;
      break;
    }
    case "midnight": {
      shapes.push(blob(grid.w + 0.2, -0.6, 2.6, colors.primary, 0.82));
      shapes.push(blob(grid.w - 1.0, 0.2, 1.1, colors.accent, 0.88));
      shapes.push(blob(-0.8, grid.h + 0.4, 2.2, colors.primary, 0.9));
      shapes.push({ t: "rect", x: mx, y: 0.52, w: 0.32, h: 0.06, radius: 0.03, fill: colors.accent });
      shapes.push(...sectionLabel(ctx, section, { x: mx + 0.48, y: 0.4, w: cw - 0.48, h: 0.3 }, colors.accent));
      shapes.push(titleShape(ctx, title, { x: mx, y: 0.78, w: cw - 1.6, h: 1.05 }, colors.heading, "bottom"));
      shapes.push({ t: "rect", x: mx, y: 1.98, w: 1.4, h: 0.06, radius: 0.03, fill: colors.accent, gradient: { from: colors.accent, to: colors.primary, angle: 0 } });
      bodyTop = 2.32;
      break;
    }
  }

  shapes.push(...footer(ctx));
  return { shapes, body: { x: mx, y: bodyTop, w: cw, h: bottom - bodyTop } };
}

/** Background fields of a frame, for layouts to pass through. */
export function frameBackground(f: Frame): Pick<LayoutResult, "background" | "backgroundGradient"> {
  return { background: f.background, backgroundGradient: f.backgroundGradient };
}
