import { columns } from "@/lib/design/layout-utils";
import type { Slide } from "@/lib/slides/types";
import { frame, type LayoutResult } from "./chrome";
import { badge, card, cardColor, fit, text, type Ctx } from "./shared";

type Quiz = Extract<Slide, { kind: "quiz" }>;

/** Review or discussion questions as numbered cards. */
export function quizLayout(slide: Quiz, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const n = slide.prompts.length;
  const twoCols = n > 3;
  const perCol = twoCols ? Math.ceil(n / 2) : n;
  const gap = 0.2;
  const cols = twoCols ? columns(body, 2, 0.3) : [body];
  const rowH = Math.min(1.5, (body.h - gap * (perCol - 1)) / perCol);
  const d = Math.min(0.62, rowH - 0.3);
  const textW = (cols[0].w ?? body.w) - d - 0.95;
  const size = Math.min(
    ...slide.prompts.map((p) => fit(ctx, [p], { x: 0, y: 0, w: textW, h: rowH - 0.2 }, { min: 12, max: ctx.sz(22) })),
  );

  slide.prompts.forEach((prompt, i) => {
    const col = twoCols ? cols[i < perCol ? 0 : 1] : cols[0];
    const row = twoCols ? (i < perCol ? i : i - perCol) : i;
    const y = body.y + row * (rowH + gap);
    const color = cardColor(ctx, i);
    shapes.push(card(ctx, { x: col.x, y, w: col.w, h: rowH }));
    shapes.push(...badge(ctx, col.x + 0.3 + d / 2, y + rowH / 2, d, String(slide.startAt + i), color));
    shapes.push(text(ctx, { x: col.x + 0.55 + d, y: y + 0.1, w: textW, h: rowH - 0.2 }, [prompt], { size, valign: "middle", color: ctx.theme.colors.heading }));
  });
  return { shapes };
}
