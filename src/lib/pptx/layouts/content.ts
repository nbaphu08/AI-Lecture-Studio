import { estimateHeight } from "@/lib/design/text-utils";
import { mix } from "@/lib/design/color";
import type { Slide } from "@/lib/slides/types";
import type { Para } from "../draw";
import { frame, type LayoutResult } from "./chrome";
import { bodyFont, card, cardColor, fit, text, type Ctx } from "./shared";

type Content = Extract<Slide, { kind: "content" }>;
type Bullets = Extract<Slide, { kind: "bullets" }>;

const MAX_READING_WIDTH = 10.6;

/** Standard content: prose paragraphs with a quiet accent bar. */
export function contentLayout(slide: Content, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const total = slide.paragraphs.join(" ").length;
  const short = total < 240;
  const box = { x: body.x + 0.35, y: body.y, w: Math.min(body.w - 0.35, MAX_READING_WIDTH), h: body.h };

  if (short) {
    // A short statement reads better as a highlighted callout.
    const callout = { x: body.x, y: body.y + 0.2, w: Math.min(body.w, MAX_READING_WIDTH + 0.6), h: Math.min(body.h - 0.2, 2.6) };
    const inner = { x: callout.x + 0.55, y: callout.y + 0.35, w: callout.w - 0.9, h: callout.h - 0.7 };
    const size = fit(ctx, slide.paragraphs, inner, { max: ctx.sz(ctx.theme.sizes.body) * 1.35, lineSpacing: 1.25 });
    shapes.push(card(ctx, callout, { line: false }));
    shapes.push({ t: "rect", x: callout.x, y: callout.y, w: 0.09, h: callout.h, fill: cardColor(ctx, 0) });
    shapes.push(text(ctx, inner, paras(slide.paragraphs, size), { size, valign: "middle", lineSpacing: 1.25 }));
    return { shapes };
  }

  const size = fit(ctx, slide.paragraphs, box, { lineSpacing: 1.2 });
  const used = estimateHeight(slide.paragraphs, { font: bodyFont(ctx), size, width: box.w, lineSpacing: 1.2 }, (size / 72) * 0.42);
  shapes.push({ t: "rect", x: body.x, y: body.y + 0.05, w: 0.06, h: Math.min(body.h, used + 0.1), fill: cardColor(ctx, 0) });
  shapes.push(text(ctx, box, paras(slide.paragraphs, size), { size, lineSpacing: 1.2 }));
  return { shapes };
}

function paras(texts: string[], size: number, bullet?: Para["bullet"]): Para[] {
  return texts.map((t) => ({ text: t, bullet, spaceAfter: Math.round(size * 0.42) }));
}

/** Title + bullets. Short lists become card rows; longer ones use native bullets. */
export function bulletsLayout(slide: Bullets, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const n = slide.bullets.length;

  const cardable = !slide.lead && !slide.numbered && n >= 2 && n <= 5 && slide.bullets.every((b) => b.length <= 130);
  if (cardable) {
    const gap = 0.18;
    const rowH = Math.min(1.15, (body.h - gap * (n - 1)) / n);
    const textW = body.w - 0.75;
    const size = Math.min(
      ...slide.bullets.map((b) => fit(ctx, [b], { x: 0, y: 0, w: textW, h: rowH - 0.2 }, { max: ctx.sz(theme.sizes.body) })),
    );
    slide.bullets.forEach((b, i) => {
      const y = body.y + i * (rowH + gap);
      shapes.push(card(ctx, { x: body.x, y, w: body.w, h: rowH }));
      shapes.push({ t: "rect", x: body.x, y, w: 0.09, h: rowH, fill: cardColor(ctx, i) });
      shapes.push(text(ctx, { x: body.x + 0.45, y: y + 0.1, w: textW, h: rowH - 0.2 }, [b], { size, valign: "middle" }));
    });
    return { shapes };
  }

  let y = body.y;
  if (slide.lead) {
    const leadBox = { x: body.x, y, w: Math.min(body.w, MAX_READING_WIDTH + 0.5), h: Math.min(1.9, body.h * 0.38) };
    const size = fit(ctx, [slide.lead], leadBox, { max: ctx.sz(theme.sizes.body) });
    const h = estimateHeight([slide.lead], { font: bodyFont(ctx), size, width: leadBox.w, lineSpacing: 1.15 });
    shapes.push(text(ctx, { ...leadBox, h: Math.min(leadBox.h, h + 0.05) }, [slide.lead], { size, color: theme.colors.mutedText }));
    y += Math.min(leadBox.h, h + 0.05) + 0.25;
  }
  const box = { x: body.x, y, w: Math.min(body.w, MAX_READING_WIDTH + 0.5), h: body.y + body.h - y };
  const size = fit(ctx, slide.bullets, box, { bullet: true, max: ctx.sz(theme.sizes.body) * 1.1 });
  shapes.push(text(ctx, box, paras(slide.bullets, size, slide.numbered ? "number" : "dot"), { size }));
  if (theme.decor !== "minimalist" && box.w < body.w - 1.5) {
    // Quiet accent mark in the free right column keeps wide slides balanced.
    shapes.push({ t: "rect", x: body.x + body.w - 0.08, y: body.y, w: 0.08, h: 0.9, fill: mix(cardColor(ctx, 1), theme.colors.background, 0.5) });
  }
  return { shapes };
}

