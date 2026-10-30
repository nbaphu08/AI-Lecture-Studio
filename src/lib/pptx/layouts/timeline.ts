import type { Slide } from "@/lib/slides/types";
import { mix, readableOn } from "@/lib/design/color";
import { estimateHeight } from "@/lib/design/text-utils";
import { frame, type LayoutResult } from "./chrome";
import { bodyFont, card, cardColor, fit, headFont, text, type Ctx } from "./shared";

type Timeline = Extract<Slide, { kind: "timeline" }>;

export function timelineLayout(slide: Timeline, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const { colors } = theme;
  const n = slide.events.length;
  const pitch = body.w / n;
  // With four or more events the cards alternate above and below the axis, so each can be wider.
  const zigzag = n >= 4;
  const cardW = zigzag ? Math.min(1.6 * pitch, 3.6) : pitch - 0.3;
  const pillH = 0.44;
  const half = zigzag ? body.h / 2 - pillH / 2 - 0.3 : body.h - pillH - 0.55;
  const textW = cardW - 0.4;
  const size = Math.min(...slide.events.map((e) => fit(ctx, [e.text], { x: 0, y: 0, w: textW, h: half - 0.4 }, { max: ctx.sz(theme.sizes.body) * 0.85, min: 12, lineSpacing: 1.2 })));
  const heights = slide.events.map((e) => estimateHeight([e.text], { font: bodyFont(ctx), size, width: textW, lineSpacing: 1.2 }));
  const fitsHorizontally = pitch >= (zigzag ? 1.25 : 1.6) && n <= 7 && heights.every((h) => h <= half - 0.4);

  if (fitsHorizontally) {
    const cardH = Math.min(half, Math.max(...heights) + 0.45);
    const lineY = zigzag ? body.y + body.h / 2 : body.y + Math.max(0.2, (body.h - pillH - 0.3 - cardH) * 0.35) + pillH / 2;
    shapes.push({ t: "line", x1: body.x, y1: lineY, x2: body.x + body.w, y2: lineY, color: colors.border, width: 2.5 });
    slide.events.forEach((e, i) => {
      const cx = body.x + pitch * (i + 0.5);
      const color = cardColor(ctx, i);
      const above = zigzag && i % 2 === 0;
      const x = Math.max(body.x, Math.min(body.x + body.w - cardW, cx - cardW / 2));
      const y = above ? lineY - pillH / 2 - 0.3 - cardH : lineY + pillH / 2 + 0.3;
      const connectorEnd = above ? y + cardH : y;
      shapes.push({ t: "line", x1: cx, y1: lineY, x2: cx, y2: connectorEnd, color: mix(color, colors.background, 0.35), width: 1.25 });
      shapes.push(card(ctx, { x, y, w: cardW, h: cardH }));
      shapes.push({ t: "rect", x, y: above ? y + cardH - 0.06 : y, w: cardW, h: 0.06, fill: color });
      shapes.push(text(ctx, { x: x + 0.2, y: y + 0.2, w: textW, h: cardH - 0.35 }, [e.text], { size, align: "center", valign: "middle", lineSpacing: 1.2 }));
      // Date pill sitting on the axis.
      const pillW = Math.min(pitch - 0.12, Math.max(1.0, e.date.length * (ctx.sz(16) / 72) * 0.62 + 0.45));
      shapes.push({
        t: "rect",
        x: cx - pillW / 2,
        y: lineY - pillH / 2,
        w: pillW,
        h: pillH,
        fill: color,
        radius: theme.radius ? pillH / 2 : 0,
        shadow: theme.look.shadow ? { blur: 6, offset: 2, opacity: 0.2, color: theme.dark ? "000000" : color } : undefined,
      });
      shapes.push(
        text(ctx, { x: cx - pillW / 2, y: lineY - pillH / 2, w: pillW, h: pillH }, [e.date], {
          size: ctx.sz(15),
          bold: true,
          color: readableOn(color, "1F2937", "FFFFFF"),
          font: headFont(ctx),
          align: "center",
          valign: "middle",
        }),
      );
    });
    return { shapes };
  }

  // Vertical timeline: dates on the left, events on the right.
  const gap = 0.14;
  const rowH = (body.h - gap * (n - 1)) / n;
  const dateW = 1.9;
  const lineX = body.x + dateW + 0.35;
  const textX = lineX + 0.5;
  const vTextW = body.x + body.w - textX - 0.3;
  const dot = 0.24;
  const vSize = Math.min(...slide.events.map((e) => fit(ctx, [e.text], { x: 0, y: 0, w: vTextW, h: rowH - 0.1 }, { min: 11 })));
  shapes.push({ t: "line", x1: lineX, y1: body.y, x2: lineX, y2: body.y + body.h, color: colors.border, width: 2.5 });
  slide.events.forEach((e, i) => {
    const y = body.y + i * (rowH + gap);
    const color = cardColor(ctx, i);
    shapes.push(text(ctx, { x: body.x, y, w: dateW, h: rowH }, [e.date], { size: ctx.sz(17), bold: true, color, font: headFont(ctx), align: "right", valign: "middle" }));
    shapes.push({ t: "ellipse", x: lineX - dot / 2, y: y + rowH / 2 - dot / 2, w: dot, h: dot, fill: color, line: { color: colors.background, width: 2.5 } });
    if (rowH >= 0.6) shapes.push(card(ctx, { x: textX - 0.2, y, w: vTextW + 0.5, h: rowH }));
    shapes.push(text(ctx, { x: textX, y: y + 0.05, w: vTextW, h: rowH - 0.1 }, [e.text], { size: vSize, valign: "middle" }));
  });
  return { shapes };
}
