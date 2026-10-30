import type { Slide } from "@/lib/slides/types";
import { columns } from "@/lib/design/layout-utils";
import { estimateHeight } from "@/lib/design/text-utils";
import { frame, type LayoutResult } from "./chrome";
import { bodyFont, card, cardColor, fit, headFont, text, type Ctx } from "./shared";

type Timeline = Extract<Slide, { kind: "timeline" }>;

export function timelineLayout(slide: Timeline, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const { colors } = theme;
  const n = slide.events.length;
  const dot = 0.26;
  const dateSize = ctx.sz(18);

  let lineY = body.y + 0.85;
  const cols = columns(body, n, 0.25);
  const textBox = (c: (typeof cols)[number]) => ({ x: c.x + 0.15, y: lineY + 0.45, w: c.w - 0.3, h: body.y + body.h - lineY - 0.6 });
  const size = Math.min(...slide.events.map((e, i) => fit(ctx, [e.text], textBox(cols[i]), { max: ctx.sz(theme.sizes.body) * 0.85, min: 12 })));
  const fitsHorizontally =
    cols[0].w >= 1.6 &&
    slide.events.every((e, i) => estimateHeight([e.text], { font: bodyFont(ctx), size, width: textBox(cols[i]).w, lineSpacing: 1.15 }) <= textBox(cols[i]).h);

  if (fitsHorizontally) {
    const tallest = Math.max(...slide.events.map((e, i) => estimateHeight([e.text], { font: bodyFont(ctx), size, width: textBox(cols[i]).w, lineSpacing: 1.15 })));
    // Center the whole timeline group (dates, axis, cards) a little above the middle of the body.
    const groupH = 0.85 + 0.25 + tallest + 0.45;
    const dy = Math.max(0, (body.h - groupH) * 0.4);
    lineY += dy;
    shapes.push({ t: "line", x1: body.x, y1: lineY, x2: body.x + body.w, y2: lineY, color: colors.border, width: 2.5 });
    slide.events.forEach((e, i) => {
      const c = cols[i];
      const cx = c.x + c.w / 2;
      const color = cardColor(ctx, i);
      shapes.push(text(ctx, { x: c.x, y: lineY - 0.85, w: c.w, h: 0.55 }, [e.date], { size: dateSize, bold: true, color, font: headFont(ctx), align: "center", valign: "bottom" }));
      shapes.push({ t: "ellipse", x: cx - dot / 2, y: lineY - dot / 2, w: dot, h: dot, fill: color, line: { color: colors.background, width: 2 } });
      const tb = textBox(c);
      const cardBox = { x: c.x, y: tb.y - 0.2, w: c.w, h: Math.min(tb.h + 0.4, tallest + 0.45) };
      shapes.push(card(ctx, cardBox));
      shapes.push({ t: "line", x1: cx, y1: lineY + dot / 2, x2: cx, y2: cardBox.y, color: colors.border, width: 1 });
      shapes.push(text(ctx, { ...tb, h: cardBox.h - 0.4 }, [e.text], { size, align: "center" }));
    });
    return { shapes };
  }

  // Vertical timeline: dates on the left, events on the right.
  const gap = 0.14;
  const rowH = (body.h - gap * (n - 1)) / n;
  const dateW = 1.9;
  const lineX = body.x + dateW + 0.35;
  const textX = lineX + 0.45;
  const textW = body.x + body.w - textX;
  const vSize = Math.min(...slide.events.map((e) => fit(ctx, [e.text], { x: 0, y: 0, w: textW, h: rowH }, { min: 11 })));
  shapes.push({ t: "line", x1: lineX, y1: body.y, x2: lineX, y2: body.y + body.h, color: colors.border, width: 2.5 });
  slide.events.forEach((e, i) => {
    const y = body.y + i * (rowH + gap);
    const color = cardColor(ctx, i);
    shapes.push(text(ctx, { x: body.x, y, w: dateW, h: rowH }, [e.date], { size: ctx.sz(16), bold: true, color, font: headFont(ctx), align: "right", valign: "middle" }));
    shapes.push({ t: "ellipse", x: lineX - dot / 2, y: y + rowH / 2 - dot / 2, w: dot, h: dot, fill: color, line: { color: colors.background, width: 2 } });
    shapes.push(text(ctx, { x: textX, y, w: textW, h: rowH }, [e.text], { size: vSize, valign: "middle" }));
  });
  return { shapes };
}
