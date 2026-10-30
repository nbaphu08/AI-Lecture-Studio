import type { Slide } from "@/lib/slides/types";
import { charWidthFactor, estimateLines, NATURAL_LINE_HEIGHT } from "@/lib/design/text-utils";
import { mix } from "@/lib/design/color";
import { frame, type LayoutResult } from "./chrome";
import { bodyFont, card, cardFill, text, type Ctx } from "./shared";

type Table = Extract<Slide, { kind: "table" }>;

const CELL_PAD_X = 0.1;
const CELL_PAD_Y = 0.07;

export function tableLayout(slide: Table, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const cells = [...(slide.headers ? [slide.headers] : []), ...slide.rows];
  if (cells.length === 0) {
    shapes.push(text(ctx, body, ["(This table has no rows.)"], { color: theme.colors.mutedText }));
    return { shapes };
  }
  const nCols = Math.max(...cells.map((r) => r.length));

  const font = bodyFont(ctx);
  // Column widths: every column fits its longest word; the rest is shared in proportion to content length.
  const longestWord = (c: number) => Math.max(3, ...cells.flatMap((r) => (r[c] ?? "").split(/\s+/).map((w) => w.length)));
  const wordW = (c: number) => longestWord(c) * (ctx.sz(16) / 72) * charWidthFactor(font, true) + CELL_PAD_X * 2 + 0.05;
  const weights = Array.from({ length: nCols }, (_, c) => Math.sqrt(Math.max(4, ...cells.map((r) => (r[c] ?? "").length))));
  const wordy = cells.some((r) => r.some((cell) => cell.length > 24));
  const tableW = (wordy ? body.w : Math.min(body.w, Math.max(nCols * 2.4, 6))) - 0.28;
  const mins = weights.map((_, c) => Math.min(wordW(c), tableW / nCols));
  const spare = Math.max(0, tableW - mins.reduce((a, b) => a + b, 0));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const widths = mins.map((m, c) => m + (weights[c] / totalWeight) * spare);

  const measure = (size: number) =>
    cells.map((row, r) => {
      const lines = Math.max(
        1,
        ...widths.map((w, c) => estimateLines(row[c] ?? "", { font, size, width: w - CELL_PAD_X * 2, bold: r === 0 && !!slide.headers })),
      );
      return lines * (size / 72) * NATURAL_LINE_HEIGHT + CELL_PAD_Y * 2 + 0.04;
    });

  let size = Math.min(ctx.sz(18), ctx.sz(theme.sizes.body));
  let rowH = measure(size);
  while (size > 10 && rowH.reduce((a, b) => a + b, 0) > body.h - 0.28) {
    size--;
    rowH = measure(size);
  }

  const tableH = rowH.reduce((a, b) => a + b, 0);
  const pad = 0.14;
  if (tableH + pad * 2 <= body.h + 0.25) {
    shapes.push(card(ctx, { x: body.x, y: body.y, w: tableW + pad * 2, h: tableH + pad * 2 }));
  }
  shapes.push({
    t: "table",
    x: body.x + pad,
    y: body.y + pad,
    w: tableW,
    colW: widths,
    rowH,
    cells: cells.map((r) => Array.from({ length: nCols }, (_, c) => r[c] ?? "")),
    hasHeader: !!slide.headers,
    font,
    size,
    textColor: theme.colors.text,
    headerColor: theme.colors.onPrimary,
    headerFill: theme.colors.primary,
    zebraFill: mix(theme.colors.primary, cardFill(ctx), theme.dark ? 0.88 : 0.95),
    bodyFill: cardFill(ctx),
    borderColor: theme.colors.border,
    rulesOnly: true,
  });
  return { shapes };
}
