import { mix, tint } from "@/lib/design/color";
import { fitFontSize, truncate } from "@/lib/design/text-utils";
import type { Rect } from "@/lib/design/tokens";
import type { Shape } from "../draw";
import { headFont, text, type Ctx } from "./shared";

export interface Frame {
  shapes: Shape[];
  /** Area available to the slide's body content. */
  body: Rect;
}

export interface LayoutResult {
  shapes: Shape[];
  background?: string;
}

/** Slide number and deck title footer. */
function footer(ctx: Ctx, dark = false): Shape[] {
  const { grid, theme } = ctx;
  const color = dark ? tint(theme.colors.primary, 0.6) : theme.colors.mutedText;
  const out: Shape[] = [];
  const y = grid.h - 0.5;
  if (ctx.showNumber) {
    out.push(
      text(ctx, { x: grid.w - grid.marginX - 1.2, y, w: 1.2, h: 0.3 }, [String(ctx.index + 1)], {
        size: ctx.sz(theme.sizes.label),
        color,
        align: "right",
        valign: "middle",
        bold: theme.decor === "modern",
      }),
    );
  }
  if (["academic", "corporate", "editorial"].includes(theme.decor)) {
    out.push(
      text(ctx, { x: grid.marginX, y, w: grid.w * 0.6, h: 0.3 }, [truncate(ctx.deckTitle, 70)], {
        size: ctx.sz(theme.sizes.label),
        color,
        valign: "middle",
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
      charSpacing: 1.5,
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

/** The standard title area + decoration for content slides, differing per theme. */
export function frame(ctx: Ctx, title: string, section?: string): Frame {
  const { theme, grid } = ctx;
  const { colors } = theme;
  const mx = grid.marginX;
  const cw = grid.w - mx * 2;
  const bottom = grid.h - 0.8;
  const shapes: Shape[] = [];
  let bodyTop: number;

  switch (theme.decor) {
    case "academic": {
      shapes.push({ t: "rect", x: 0, y: 0, w: 0.2, h: grid.h, fill: colors.primary });
      shapes.push(...sectionLabel(ctx, section, { x: mx, y: 0.4, w: cw, h: 0.3 }, colors.secondary));
      shapes.push(titleShape(ctx, title, { x: mx, y: 0.72, w: cw, h: 1.05 }, colors.primary, "bottom"));
      shapes.push({ t: "line", x1: mx, y1: 1.9, x2: grid.w - mx, y2: 1.9, color: colors.border, width: 1 });
      shapes.push({ t: "rect", x: mx, y: 1.87, w: 1.2, h: 0.06, fill: colors.accent });
      bodyTop = 2.2;
      break;
    }
    case "minimalist": {
      shapes.push({ t: "rect", x: mx, y: 0.62, w: 0.55, h: 0.05, fill: colors.accent });
      shapes.push(...sectionLabel(ctx, section, { x: mx + 0.8, y: 0.5, w: cw - 0.8, h: 0.3 }, colors.mutedText));
      shapes.push(titleShape(ctx, title, { x: mx, y: 0.9, w: cw, h: 1.05 }, colors.primary, "top"));
      bodyTop = 2.25;
      break;
    }
    case "modern": {
      shapes.push({
        t: "ellipse",
        x: grid.w - 2.1,
        y: -1.3,
        w: 3.4,
        h: 3.4,
        fill: mix(colors.primary, colors.background, theme.dark ? 0.8 : 0.9),
      });
      shapes.push(...sectionLabel(ctx, section, { x: mx, y: 0.42, w: cw, h: 0.3 }, colors.secondary));
      shapes.push(titleShape(ctx, title, { x: mx, y: 0.75, w: cw - 1.6, h: 1.05 }, colors.primary, "bottom"));
      shapes.push({ t: "rect", x: mx, y: 1.95, w: 0.95, h: 0.1, fill: colors.accent, radius: 0.05 });
      bodyTop = 2.35;
      break;
    }
    case "corporate": {
      shapes.push({ t: "rect", x: 0, y: 0, w: grid.w, h: 1.3, fill: colors.primary });
      shapes.push({ t: "rect", x: 0, y: 1.3, w: grid.w, h: 0.07, fill: colors.accent });
      shapes.push(...sectionLabel(ctx, section, { x: mx, y: 0.14, w: cw, h: 0.28 }, tint(colors.primary, 0.7)));
      const t = titleShape(ctx, title, { x: mx, y: 0.42, w: cw, h: 0.8 }, colors.onPrimary, "middle");
      shapes.push(t);
      bodyTop = 1.75;
      break;
    }
    case "editorial": {
      shapes.push({ t: "line", x1: mx, y1: 0.5, x2: grid.w - mx, y2: 0.5, color: colors.primary, width: 1 });
      shapes.push(...sectionLabel(ctx, section, { x: mx, y: 0.6, w: cw, h: 0.3 }, colors.accent));
      shapes.push(titleShape(ctx, title, { x: mx, y: 0.92, w: cw, h: 1.05 }, colors.primary, "top", false));
      shapes.push({ t: "line", x1: mx, y1: 2.12, x2: grid.w - mx, y2: 2.12, color: colors.primary, width: 2 });
      shapes.push({ t: "line", x1: mx, y1: 2.18, x2: grid.w - mx, y2: 2.18, color: colors.primary, width: 0.5 });
      bodyTop = 2.5;
      break;
    }
  }

  shapes.push(...footer(ctx));
  return { shapes, body: { x: mx, y: bodyTop, w: cw, h: bottom - bodyTop } };
}
