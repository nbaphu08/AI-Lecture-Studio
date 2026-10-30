import type { Slide } from "@/lib/slides/types";
import { mix } from "@/lib/design/color";
import { frame, type LayoutResult } from "./chrome";
import { fit, headFont, text, type Ctx } from "./shared";

type Definition = Extract<Slide, { kind: "definition" }>;

export function definitionLayout(slide: Definition, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const { colors } = theme;
  const tinted = mix(colors.primary, colors.background, 0.9);
  const labelOpts = {
    size: ctx.sz(theme.sizes.label),
    color: colors.accent,
    bold: true,
    uppercase: true,
    charSpacing: 1.5,
  };

  if (slide.term.trim().toLowerCase() === slide.title.trim().toLowerCase()) {
    const panel = { x: body.x, y: body.y + 0.1, w: body.w, h: Math.min(body.h - 0.1, 3.4) };
    shapes.push({ t: "rect", ...panel, fill: tinted, radius: theme.radius });
    shapes.push({ t: "rect", x: panel.x, y: panel.y, w: 0.12, h: panel.h, fill: colors.accent });
    shapes.push(text(ctx, { x: panel.x + 0.6, y: panel.y + 0.35, w: 4, h: 0.3 }, ["Key concept"], labelOpts));
    const box = { x: panel.x + 0.6, y: panel.y + 0.8, w: panel.w - 1.2, h: panel.h - 1.15 };
    const size = fit(ctx, [slide.definition], box, { max: ctx.sz(theme.sizes.body) * 1.3, lineSpacing: 1.25 });
    shapes.push(text(ctx, box, [slide.definition], { size, lineSpacing: 1.25, valign: "middle" }));
    return { shapes };
  }

  const leftW = Math.min(4.2, body.w * 0.36);
  const left = { x: body.x, y: body.y + 0.1, w: leftW, h: Math.min(body.h - 0.1, 3.6) };
  shapes.push({ t: "rect", ...left, fill: colors.primary, radius: theme.radius });
  shapes.push(text(ctx, { x: left.x + 0.4, y: left.y + 0.35, w: left.w - 0.8, h: 0.3 }, ["Key concept"], { ...labelOpts, color: mix(colors.onPrimary, colors.primary, 0.3) }));
  const termBox = { x: left.x + 0.4, y: left.y + 0.8, w: left.w - 0.8, h: left.h - 1.1 };
  const termSize = fit(ctx, [slide.term], termBox, { max: ctx.sz(32), min: 16, bold: true, font: headFont(ctx), lineSpacing: 1.05 });
  shapes.push(text(ctx, termBox, [slide.term], { size: termSize, bold: true, color: colors.onPrimary, font: headFont(ctx), valign: "middle", lineSpacing: 1.05 }));

  const right = { x: left.x + left.w + 0.6, y: left.y, w: body.w - left.w - 0.6, h: left.h };
  const size = fit(ctx, [slide.definition], right, { max: ctx.sz(theme.sizes.body) * 1.2, lineSpacing: 1.25 });
  shapes.push(text(ctx, right, [slide.definition], { size, valign: "middle", lineSpacing: 1.25 }));
  return { shapes };
}
