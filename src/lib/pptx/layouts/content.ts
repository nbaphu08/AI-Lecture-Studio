import { estimateHeight } from "@/lib/design/text-utils";
import { mix } from "@/lib/design/color";
import { columns, rows } from "@/lib/design/layout-utils";
import type { Slide } from "@/lib/slides/types";
import type { Para, Shape } from "../draw";
import { frame, type LayoutResult } from "./chrome";
import { badge, bodyFont, card, cardColor, colorGradient, fit, headFont, heroGradient, rings, text, type Ctx } from "./shared";

type Content = Extract<Slide, { kind: "content" }>;
type Bullets = Extract<Slide, { kind: "bullets" }>;

const MAX_READING_WIDTH = 10.6;

/** Vertical accent bar; a gradient on themes that use them. */
function accentBar(ctx: Ctx, x: number, y: number, h: number, color: string, w = 0.08): Shape {
  const flat = ctx.theme.decor === "minimalist" || ctx.theme.decor === "editorial";
  return { t: "rect", x, y, w, h, fill: color, gradient: flat ? undefined : colorGradient(color, 90) };
}

/** Big decorative opening quote mark. */
export function quoteMark(ctx: Ctx, x: number, y: number, color: string, size = 96, alpha = 0): Shape {
  return text(ctx, { x, y, w: 1.2, h: 1.1 }, ["“"], { size: ctx.sz(size), color, font: "Georgia", bold: true, alpha, lineSpacing: 0.8 });
}

/** Standard content: prose paragraphs in a quiet panel, or a pull-quote for short statements. */
export function contentLayout(slide: Content, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const total = slide.paragraphs.join(" ").length;
  const short = total < 240;

  if (short) {
    const callout = { x: body.x, y: body.y + 0.15, w: Math.min(body.w, MAX_READING_WIDTH + 0.9), h: Math.min(body.h - 0.2, 2.9) };
    const inner = { x: callout.x + 1.1, y: callout.y + 0.4, w: callout.w - 1.6, h: callout.h - 0.8 };
    const size = fit(ctx, slide.paragraphs, inner, { max: ctx.sz(theme.sizes.body) * 1.4, lineSpacing: 1.3, font: headFont(ctx) });
    shapes.push(card(ctx, callout));
    shapes.push(accentBar(ctx, callout.x, callout.y, callout.h, cardColor(ctx, 0), 0.1));
    shapes.push(quoteMark(ctx, callout.x + 0.3, callout.y + 0.15, cardColor(ctx, 0)));
    shapes.push(
      text(ctx, inner, paras(slide.paragraphs, size), { size, valign: "middle", lineSpacing: 1.3, font: headFont(ctx), color: theme.colors.heading }),
    );
    if (callout.x + callout.w < body.x + body.w - 1.2 && theme.decor !== "minimalist") {
      shapes.push(...rings(body.x + body.w - 0.6, callout.y + callout.h - 0.2, 0.5, cardColor(ctx, 1), 3, 0.3, 0.75));
    }
    return { shapes };
  }

  // Longer prose: the first paragraph becomes a lead in the heading color, the rest follow in body text.
  const lead = slide.paragraphs.length > 1 && slide.paragraphs[0].length < 320 ? slide.paragraphs[0] : null;
  const rest = lead ? slide.paragraphs.slice(1) : slide.paragraphs;
  const box = { x: body.x + 0.45, y: body.y, w: Math.min(body.w - 0.45, MAX_READING_WIDTH), h: body.h };
  const all = lead ? [lead, ...rest] : rest;
  const size = fit(ctx, all, box, { lineSpacing: 1.2 });
  const leadSize = lead ? Math.min(size * 1.12, ctx.sz(theme.sizes.body) * 1.15) : size;
  const used = estimateHeight(all, { font: bodyFont(ctx), size: leadSize, width: box.w, lineSpacing: 1.2 }, (size / 72) * 0.5);
  shapes.push(accentBar(ctx, body.x, body.y + 0.05, Math.min(body.h, used + 0.1), cardColor(ctx, 0), 0.07));
  const list: Para[] = [
    ...(lead ? [{ text: lead, size: leadSize, color: theme.colors.heading, spaceAfter: Math.round(size * 0.6) }] : []),
    ...rest.map((t) => ({ text: t, spaceAfter: Math.round(size * 0.5) })),
  ];
  shapes.push(text(ctx, box, list, { size, lineSpacing: 1.2 }));
  return { shapes };
}

function paras(texts: string[], size: number, bullet?: Para["bullet"]): Para[] {
  return texts.map((t) => ({ text: t, bullet, spaceAfter: Math.round(size * 0.42) }));
}

/** Big two-digit index ("01") used on feature cards. */
function indexLabel(ctx: Ctx, i: number, x: number, y: number, color: string): Shape {
  return text(ctx, { x, y, w: 1.4, h: 0.6 }, [String(i + 1).padStart(2, "0")], {
    size: ctx.sz(30),
    bold: ctx.theme.decor !== "editorial",
    font: headFont(ctx),
    color,
    valign: "bottom",
  });
}

/** Title + bullets: feature cards for short lists, a lead panel for introduced lists, native bullets otherwise. */
export function bulletsLayout(slide: Bullets, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const { colors } = theme;
  const n = slide.bullets.length;
  const short = slide.bullets.every((b) => b.length <= 130);

  // 2–3 short items: side-by-side feature cards with a large index number.
  if (!slide.lead && !slide.numbered && short && (n === 2 || n === 3)) {
    const cols = columns(body, n, 0.35);
    const textW = cols[0].w - 0.7;
    const size = Math.min(...slide.bullets.map((b) => fit(ctx, [b], { x: 0, y: 0, w: textW, h: body.h - 1.6 }, { max: ctx.sz(theme.sizes.body), lineSpacing: 1.2 })));
    const tallest = Math.max(...slide.bullets.map((b) => estimateHeight([b], { font: bodyFont(ctx), size, width: textW, lineSpacing: 1.2 })));
    const cardH = Math.min(body.h, Math.max(2.4, tallest + 1.75));
    cols.forEach((c, i) => {
      const color = cardColor(ctx, i);
      const box = { x: c.x, y: c.y, w: c.w, h: cardH };
      shapes.push(card(ctx, box));
      shapes.push({ t: "rect", x: box.x, y: box.y, w: box.w, h: 0.08, fill: color, gradient: colorGradient(color, 0) });
      shapes.push(indexLabel(ctx, i, box.x + 0.35, box.y + 0.3, color));
      shapes.push({ t: "rect", x: box.x + 0.35, y: box.y + 1.02, w: 0.5, h: 0.04, fill: mix(color, colors.background, 0.5) });
      shapes.push(text(ctx, { x: box.x + 0.35, y: box.y + 1.25, w: textW, h: cardH - 1.5 }, [slide.bullets[i]], { size, lineSpacing: 1.2 }));
    });
    return { shapes };
  }

  // 4 short items: a 2×2 grid of cards with numbered badges.
  if (!slide.lead && !slide.numbered && short && n === 4) {
    const gridRows = rows(body, 2, 0.3);
    const cells = gridRows.flatMap((r) => columns(r, 2, 0.35));
    const textW = cells[0].w - 1.35;
    const size = Math.min(...slide.bullets.map((b) => fit(ctx, [b], { x: 0, y: 0, w: textW, h: cells[0].h - 0.4 }, { max: ctx.sz(theme.sizes.body), lineSpacing: 1.2 })));
    cells.forEach((c, i) => {
      const color = cardColor(ctx, i);
      shapes.push(card(ctx, c));
      shapes.push(...badge(ctx, c.x + 0.6, c.y + c.h / 2, 0.58, String(i + 1), color));
      shapes.push(text(ctx, { x: c.x + 1.1, y: c.y + 0.2, w: textW, h: c.h - 0.4 }, [slide.bullets[i]], { size, valign: "middle", lineSpacing: 1.2 }));
    });
    return { shapes };
  }

  // 5–6 short items: rows with numbered badges.
  if (!slide.lead && !slide.numbered && short && n >= 5 && n <= 6) {
    const gap = 0.16;
    const rowH = Math.min(1.0, (body.h - gap * (n - 1)) / n);
    const textW = body.w - 1.25;
    const size = Math.min(...slide.bullets.map((b) => fit(ctx, [b], { x: 0, y: 0, w: textW, h: rowH - 0.14 }, { max: ctx.sz(theme.sizes.body), min: 11 })));
    slide.bullets.forEach((b, i) => {
      const y = body.y + i * (rowH + gap);
      shapes.push(card(ctx, { x: body.x, y, w: body.w, h: rowH }));
      shapes.push(...badge(ctx, body.x + 0.5, y + rowH / 2, Math.min(0.48, rowH - 0.18), String(i + 1), cardColor(ctx, i)));
      shapes.push(text(ctx, { x: body.x + 1.0, y: y + 0.07, w: textW, h: rowH - 0.14 }, [b], { size, valign: "middle" }));
    });
    return { shapes };
  }

  // An introduced short list: the lead on top, the items as a row of cards beneath it.
  if (slide.lead && !slide.numbered && short && n >= 2 && n <= 4) {
    const leadBox = { x: body.x, y: body.y, w: Math.min(body.w, MAX_READING_WIDTH + 0.8), h: Math.min(1.7, body.h * 0.4) };
    const leadSize = fit(ctx, [slide.lead], leadBox, { max: ctx.sz(theme.sizes.body), lineSpacing: 1.2 });
    const leadH = Math.min(leadBox.h, estimateHeight([slide.lead], { font: bodyFont(ctx), size: leadSize, width: leadBox.w, lineSpacing: 1.2 }) + 0.05);
    const area = { x: body.x, y: body.y + leadH + 0.35, w: body.w, h: body.h - leadH - 0.35 };
    const cols = columns(area, n, 0.3);
    const textW = cols[0].w - 0.6;
    const size = Math.min(...slide.bullets.map((b) => fit(ctx, [b], { x: 0, y: 0, w: textW, h: area.h - 1.15 }, { max: ctx.sz(theme.sizes.body), lineSpacing: 1.2 })));
    const tallest = Math.max(...slide.bullets.map((b) => estimateHeight([b], { font: bodyFont(ctx), size, width: textW, lineSpacing: 1.2 })));
    if (area.h >= 1.6 && tallest <= area.h - 1.15) {
      shapes.push(text(ctx, { ...leadBox, h: leadH }, [slide.lead], { size: leadSize, color: colors.mutedText, lineSpacing: 1.2 }));
      const cardH = Math.min(area.h, tallest + 1.2);
      cols.forEach((c, i) => {
        const color = cardColor(ctx, i);
        shapes.push(card(ctx, { ...c, h: cardH }));
        shapes.push(...badge(ctx, c.x + 0.6, c.y + 0.55, 0.5, String(i + 1), color));
        shapes.push(text(ctx, { x: c.x + 0.3, y: c.y + 1.0, w: textW, h: cardH - 1.15 }, [slide.bullets[i]], { size, lineSpacing: 1.2 }));
      });
      return { shapes };
    }
  }

  // An introduced list: the lead sits on a feature panel on the left, the list on the right.
  if (slide.lead && slide.lead.length <= 260 && body.w > 8) {
    const panel = { x: body.x, y: body.y, w: Math.min(4.4, body.w * 0.36), h: body.h };
    const inner = { x: panel.x + 0.45, y: panel.y + 0.5, w: panel.w - 0.9, h: panel.h - 1.0 };
    const leadSize = fit(ctx, [slide.lead], inner, { max: ctx.sz(theme.sizes.body) * 1.05, lineSpacing: 1.25 });
    shapes.push({ t: "rect", ...panel, fill: colors.primary, gradient: heroGradient(ctx), radius: theme.radius, shadow: theme.look.shadow ?? undefined });
    shapes.push(...rings(panel.x + panel.w - 0.2, panel.y + panel.h - 0.2, 0.5, colors.onHero, 3, 0.3, 0.85));
    shapes.push(text(ctx, inner, [slide.lead], { size: leadSize, color: colors.onHero, valign: "middle", lineSpacing: 1.25 }));
    const listBox = { x: panel.x + panel.w + 0.6, y: body.y + 0.1, w: body.w - panel.w - 0.6, h: body.h - 0.2 };
    const size = fit(ctx, slide.bullets, listBox, { bullet: true, max: ctx.sz(theme.sizes.body) });
    shapes.push(text(ctx, listBox, paras(slide.bullets, size, slide.numbered ? "number" : "dot"), { size, valign: "middle" }));
    return { shapes };
  }

  let y = body.y;
  if (slide.lead) {
    const leadBox = { x: body.x, y, w: Math.min(body.w, MAX_READING_WIDTH + 0.5), h: Math.min(1.9, body.h * 0.38) };
    const size = fit(ctx, [slide.lead], leadBox, { max: ctx.sz(theme.sizes.body) });
    const h = estimateHeight([slide.lead], { font: bodyFont(ctx), size, width: leadBox.w, lineSpacing: 1.15 });
    shapes.push(text(ctx, { ...leadBox, h: Math.min(leadBox.h, h + 0.05) }, [slide.lead], { size, color: colors.mutedText }));
    y += Math.min(leadBox.h, h + 0.05) + 0.25;
  }
  // Longer lists sit in a single panel with an accent bar.
  const panel = { x: body.x, y, w: Math.min(body.w, MAX_READING_WIDTH + 1.2), h: body.y + body.h - y };
  const box = { x: panel.x + 0.5, y: panel.y + 0.3, w: panel.w - 0.8, h: panel.h - 0.6 };
  const size = fit(ctx, slide.bullets, box, { bullet: true, max: ctx.sz(theme.sizes.body) * 1.05 });
  const used = estimateHeight(slide.bullets, { font: bodyFont(ctx), size, width: box.w, lineSpacing: 1.15, indent: 0.3 }, (size / 72) * 0.42);
  const panelH = Math.min(panel.h, used + 0.75);
  shapes.push(card(ctx, { ...panel, h: panelH }));
  shapes.push(accentBar(ctx, panel.x, panel.y, panelH, cardColor(ctx, 0)));
  shapes.push(text(ctx, { ...box, h: panelH - 0.6 }, paras(slide.bullets, size, slide.numbered ? "number" : "dot"), { size, valign: "middle" }));
  return { shapes };
}
