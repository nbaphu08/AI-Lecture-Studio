import type { Slide } from "@/lib/slides/types";
import { columns } from "@/lib/design/layout-utils";
import { estimateHeight } from "@/lib/design/text-utils";
import { mix } from "@/lib/design/color";
import { frame, type LayoutResult } from "./chrome";
import { badge, bodyFont, card, cardColor, fit, text, type Ctx } from "./shared";

type Process = Extract<Slide, { kind: "process" }>;

const MIN_SIZE = 12;

export function processLayout(slide: Process, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const n = slide.steps.length;
  const d = 0.62;

  // Horizontal flow when the text fits comfortably; otherwise a vertical list of steps.
  const gap = 0.38;
  const cols = columns({ ...body, y: body.y + d / 2, h: body.h - d / 2 }, n, gap);
  const textBox = (c: (typeof cols)[number]) => ({ x: c.x + 0.2, y: c.y + d / 2 + 0.2, w: c.w - 0.4, h: c.h - d / 2 - 0.4 });
  const sizes = slide.steps.map((s, i) => fit(ctx, [s], textBox(cols[i]), { max: ctx.sz(theme.sizes.body) * 0.9, min: MIN_SIZE }));
  const size = Math.min(...sizes);
  const fitsHorizontally =
    n <= 6 &&
    cols[0].w >= 1.5 &&
    slide.steps.every((s, i) => estimateHeight([s], { font: bodyFont(ctx), size, width: textBox(cols[i]).w, lineSpacing: 1.15 }) <= textBox(cols[i]).h);

  if (fitsHorizontally) {
    const tallest = Math.max(
      ...slide.steps.map((s, i) => estimateHeight([s], { font: bodyFont(ctx), size, width: textBox(cols[i]).w, lineSpacing: 1.15 })),
    );
    const cardH = Math.min(cols[0].h, Math.max(1.9, tallest + d / 2 + 0.6));
    // Sit the row slightly above the vertical center of the free space.
    const offset = Math.max(0, (cols[0].h - cardH) * 0.4);
    cols.forEach((col, i) => {
      const c = { ...col, y: col.y + offset };
      shapes.push(card(ctx, { x: c.x, y: c.y, w: c.w, h: cardH }));
      if (i < n - 1) {
        const y = c.y + cardH / 2;
        shapes.push({ t: "line", x1: c.x + c.w + 0.06, y1: y, x2: c.x + c.w + gap - 0.06, y2: y, color: theme.colors.mutedText, width: 1.5, arrow: true });
      }
      shapes.push(...badge(ctx, c.x + c.w / 2, c.y, d, String(slide.startAt + i), cardColor(ctx, i)));
      shapes.push(text(ctx, { ...textBox(c), h: cardH - d / 2 - 0.4 }, [slide.steps[i]], { size, align: "center" }));
    });
    return { shapes };
  }

  // Vertical: numbered badges on a connecting line, each step in its own row.
  const rowGap = 0.16;
  const rowH = (body.h - rowGap * (n - 1)) / n;
  const textX = body.x + 1.05;
  const textW = body.w - 1.25;
  const vSize = Math.min(...slide.steps.map((s) => fit(ctx, [s], { x: 0, y: 0, w: textW, h: rowH - 0.12 }, { min: 11 })));
  const bd = Math.min(d, rowH - 0.08);
  shapes.push({
    t: "line",
    x1: body.x + 0.4,
    y1: body.y + rowH / 2,
    x2: body.x + 0.4,
    y2: body.y + body.h - rowH / 2,
    color: mix(theme.colors.primary, theme.colors.background, 0.6),
    width: 2,
  });
  slide.steps.forEach((s, i) => {
    const y = body.y + i * (rowH + rowGap);
    shapes.push(card(ctx, { x: textX - 0.25, y, w: textW + 0.45, h: rowH }));
    shapes.push(...badge(ctx, body.x + 0.4, y + rowH / 2, bd, String(slide.startAt + i), cardColor(ctx, i)));
    shapes.push(text(ctx, { x: textX, y: y + 0.06, w: textW, h: rowH - 0.12 }, [s], { size: vSize, valign: "middle" }));
  });
  return { shapes };
}
