import type { Slide } from "@/lib/slides/types";
import { estimateHeight } from "@/lib/design/text-utils";
import { mix, readableOn } from "@/lib/design/color";
import { frame, type LayoutResult } from "./chrome";
import { badge, bodyFont, card, cardColor, fit, headFont, text, type Ctx } from "./shared";

type Process = Extract<Slide, { kind: "process" }>;

const MIN_SIZE = 12;

/** Step colors run from the primary color to the accent, unless the palette is "colorful". */
function stepColor(ctx: Ctx, i: number, n: number): string {
  const { theme } = ctx;
  if (theme.colorful) return cardColor(ctx, i);
  const end = theme.decor === "minimalist" || theme.decor === "editorial" ? theme.colors.primary : theme.colors.accent;
  return mix(theme.colors.primary, end, n > 1 ? (i / (n - 1)) * 0.85 : 0);
}

export function processLayout(slide: Process, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const n = slide.steps.length;

  // Horizontal: a chevron band with the step numbers, and a card with each step's text beneath it.
  const tip = 0.3;
  const gap = 0.08;
  const bandH = 0.72;
  const stepW = (body.w - tip - gap * (n - 1)) / n;
  const textBox = (i: number) => ({ x: body.x + i * (stepW + gap) + 0.22, y: body.y + bandH + 0.5, w: stepW - 0.44, h: body.h - bandH - 0.75 });
  const size = Math.min(...slide.steps.map((st, i) => fit(ctx, [st], textBox(i), { max: ctx.sz(theme.sizes.body) * 0.9, min: MIN_SIZE, lineSpacing: 1.2 })));
  const fitsHorizontally =
    n <= 6 &&
    stepW >= 1.5 &&
    slide.steps.every((st, i) => estimateHeight([st], { font: bodyFont(ctx), size, width: textBox(i).w, lineSpacing: 1.2 }) <= textBox(i).h);

  if (fitsHorizontally) {
    const tallest = Math.max(...slide.steps.map((st, i) => estimateHeight([st], { font: bodyFont(ctx), size, width: textBox(i).w, lineSpacing: 1.2 })));
    const cardH = Math.min(body.h - bandH - 0.25, Math.max(1.6, tallest + 0.55));
    const groupH = bandH + 0.25 + cardH;
    const top = body.y + Math.max(0, (body.h - groupH) * 0.35);
    slide.steps.forEach((st, i) => {
      const x = body.x + i * (stepW + gap);
      const color = stepColor(ctx, i, n);
      const notch = i === 0 ? 0 : tip;
      shapes.push({
        t: "poly",
        points: [
          [x, top],
          [x + stepW, top],
          [x + stepW + tip, top + bandH / 2],
          [x + stepW, top + bandH],
          [x, top + bandH],
          [x + notch, top + bandH / 2],
        ],
        fill: color,
        gradient: theme.decor === "minimalist" || theme.decor === "editorial" ? undefined : { from: color, to: mix(color, "FFFFFF", 0.18), angle: 0 },
      });
      const on = readableOn(color, "1F2937", "FFFFFF");
      shapes.push(
        text(ctx, { x: x + notch + 0.12, y: top, w: stepW - notch - 0.1, h: bandH }, [`Step ${slide.startAt + i}`], {
          size: ctx.sz(15),
          bold: true,
          color: on,
          font: headFont(ctx),
          align: "center",
          valign: "middle",
          uppercase: true,
          charSpacing: 1.2,
        }),
      );
      const cardBox = { x, y: top + bandH + 0.25, w: stepW, h: cardH };
      shapes.push(card(ctx, cardBox));
      shapes.push({ t: "rect", x: cardBox.x, y: cardBox.y, w: cardBox.w, h: 0.06, fill: color });
      shapes.push(text(ctx, { x: x + 0.22, y: cardBox.y + 0.28, w: stepW - 0.44, h: cardH - 0.4 }, [st], { size, lineSpacing: 1.2 }));
    });
    return { shapes };
  }

  // Vertical: numbered badges on a connecting line, each step in its own row.
  const rowGap = 0.16;
  const rowH = (body.h - rowGap * (n - 1)) / n;
  const textX = body.x + 1.05;
  const textW = body.w - 1.25;
  const vSize = Math.min(...slide.steps.map((s) => fit(ctx, [s], { x: 0, y: 0, w: textW, h: rowH - 0.12 }, { min: 11 })));
  const d = 0.62;
  const bd = Math.min(d, rowH - 0.08);
  shapes.push({
    t: "line",
    x1: body.x + 0.4,
    y1: body.y + rowH / 2,
    x2: body.x + 0.4,
    y2: body.y + body.h - rowH / 2,
    color: mix(theme.colors.primary, theme.colors.background, 0.6),
    width: 2,
    dash: "dash",
  });
  slide.steps.forEach((s, i) => {
    const y = body.y + i * (rowH + rowGap);
    shapes.push(card(ctx, { x: textX - 0.25, y, w: textW + 0.45, h: rowH }));
    shapes.push(...badge(ctx, body.x + 0.4, y + rowH / 2, bd, String(slide.startAt + i), stepColor(ctx, i, n)));
    shapes.push(text(ctx, { x: textX, y: y + 0.06, w: textW, h: rowH - 0.12 }, [s], { size: vSize, valign: "middle" }));
  });
  return { shapes };
}
