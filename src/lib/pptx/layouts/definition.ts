import type { Slide } from "@/lib/slides/types";
import { mix, tint } from "@/lib/design/color";
import { frame, type LayoutResult } from "./chrome";
import { quoteMark } from "./content";
import { card, fit, headFont, heroGradient, rings, text, type Ctx } from "./shared";

type Definition = Extract<Slide, { kind: "definition" }>;

export function definitionLayout(slide: Definition, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const { colors } = theme;
  const labelOpts = {
    size: ctx.sz(theme.sizes.label),
    color: colors.accent,
    bold: true,
    uppercase: true,
    charSpacing: 1.8,
  };

  if (slide.term.trim().toLowerCase() === slide.title.trim().toLowerCase()) {
    // The title already names the concept: show the explanation as a large statement.
    const panel = { x: body.x, y: body.y + 0.1, w: body.w, h: Math.min(body.h - 0.1, 3.5) };
    shapes.push(card(ctx, panel));
    shapes.push({ t: "rect", x: panel.x, y: panel.y, w: 0.12, h: panel.h, fill: colors.accent, gradient: { from: colors.accent, to: colors.primary, angle: 90 } });
    shapes.push(quoteMark(ctx, panel.x + panel.w - 1.6, panel.y + 0.1, colors.primary, 150, theme.dark ? 0.75 : 0.88));
    shapes.push(text(ctx, { x: panel.x + 0.65, y: panel.y + 0.4, w: 4, h: 0.3 }, ["Key concept"], labelOpts));
    const box = { x: panel.x + 0.65, y: panel.y + 0.85, w: panel.w - 1.5, h: panel.h - 1.2 };
    const size = fit(ctx, [slide.definition], box, { max: ctx.sz(theme.sizes.body) * 1.35, lineSpacing: 1.3, font: headFont(ctx) });
    shapes.push(text(ctx, box, [slide.definition], { size, lineSpacing: 1.3, valign: "middle", font: headFont(ctx), color: colors.heading }));
    return { shapes };
  }

  // Term on a feature panel, explanation beside it.
  const leftW = Math.min(4.4, body.w * 0.38);
  const left = { x: body.x, y: body.y + 0.1, w: leftW, h: Math.min(body.h - 0.1, 3.7) };
  shapes.push({ t: "rect", ...left, fill: colors.primary, gradient: heroGradient(ctx), radius: theme.radius, shadow: theme.look.shadow ?? undefined });
  shapes.push(...rings(left.x + left.w - 0.1, left.y + 0.1, 0.55, colors.onHero, 3, 0.32, 0.82));
  shapes.push(
    text(ctx, { x: left.x + 0.45, y: left.y + 0.4, w: left.w - 0.9, h: 0.3 }, ["Key concept"], {
      ...labelOpts,
      color: mix(colors.onHero, colors.gradFrom, 0.25),
    }),
  );
  const termBox = { x: left.x + 0.45, y: left.y + 0.85, w: left.w - 0.9, h: left.h - 1.2 };
  const termSize = fit(ctx, [slide.term], termBox, { max: ctx.sz(34), min: 16, bold: true, font: headFont(ctx), lineSpacing: 1.05 });
  shapes.push(text(ctx, termBox, [slide.term], { size: termSize, bold: true, color: colors.onHero, font: headFont(ctx), valign: "middle", lineSpacing: 1.05 }));

  const right = { x: left.x + left.w + 0.7, y: left.y, w: body.w - left.w - 0.7, h: left.h };
  shapes.push(quoteMark(ctx, right.x - 0.05, right.y - 0.1, theme.dark ? colors.accent : tint(colors.accent, 0.1), 80));
  const defBox = { x: right.x, y: right.y + 0.9, w: right.w, h: right.h - 0.9 };
  const size = fit(ctx, [slide.definition], defBox, { max: ctx.sz(theme.sizes.body) * 1.2, lineSpacing: 1.3 });
  shapes.push(text(ctx, defBox, [slide.definition], { size, valign: "top", lineSpacing: 1.3 }));
  return { shapes };
}
