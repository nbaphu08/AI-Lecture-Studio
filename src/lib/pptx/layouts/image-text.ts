import type { Slide } from "@/lib/slides/types";
import { containRect, columns } from "@/lib/design/layout-utils";
import { frame, type LayoutResult } from "./chrome";
import { bodyFont, cardColor, fit, heroGradient, text, type Ctx } from "./shared";
import { estimateHeight } from "@/lib/design/text-utils";
import type { Para } from "../draw";

type ImageText = Extract<Slide, { kind: "imageText" }>;

export function imageTextLayout(slide: ImageText, ctx: Ctx): LayoutResult {
  const { shapes, body } = frame(ctx, slide.title, slide.section);
  const { theme } = ctx;
  const ratio = slide.image.width && slide.image.height ? slide.image.width / slide.image.height : 4 / 3;
  const hasText = slide.paragraphs.length + slide.bullets.length > 0;
  const caption = slide.image.alt;
  const captionH = caption ? 0.45 : 0;

  const [imgArea, textArea] = hasText ? columns(body, 2, 0.55) : [body, null];
  const offset = 0.2;
  const imgBox = containRect({ x: imgArea.x, y: imgArea.y, w: imgArea.w - offset, h: imgArea.h - captionH - offset }, ratio);
  // An accent block offset behind the picture frames it like a print.
  shapes.push({
    t: "rect",
    x: imgBox.x + offset,
    y: imgBox.y + offset,
    w: imgBox.w,
    h: imgBox.h,
    fill: theme.colors.primary,
    gradient: theme.decor === "minimalist" || theme.decor === "editorial" ? undefined : heroGradient(ctx),
    alpha: theme.decor === "minimalist" ? 0.85 : 0,
  });
  shapes.push({ t: "image", ...imgBox, src: slide.image.src, alt: caption, shadow: theme.look.shadow ?? undefined });
  if (caption) {
    shapes.push(
      text(ctx, { x: imgArea.x, y: imgBox.y + imgBox.h + offset + 0.08, w: imgArea.w, h: captionH - 0.08 }, [caption], {
        size: ctx.sz(theme.sizes.small),
        color: theme.colors.mutedText,
        italic: true,
        align: "center",
      }),
    );
  }

  if (textArea) {
    const texts = [...slide.paragraphs, ...slide.bullets];
    const size = fit(ctx, texts, { ...textArea, w: textArea.w - 0.35 }, { bullet: slide.bullets.length > 0, lineSpacing: 1.2 });
    const paras: Para[] = [
      ...slide.paragraphs.map((t) => ({ text: t, spaceAfter: Math.round(size * 0.42) })),
      ...slide.bullets.map((t) => ({ text: t, bullet: "dot" as const, spaceAfter: Math.round(size * 0.42) })),
    ];
    const used = estimateHeight(texts, { font: bodyFont(ctx), size, width: textArea.w - 0.35, lineSpacing: 1.2 }, (size / 72) * 0.42);
    const barH = Math.min(textArea.h, used + 0.1);
    shapes.push({ t: "rect", x: textArea.x, y: textArea.y + (textArea.h - barH) / 2, w: 0.07, h: barH, fill: cardColor(ctx, 0) });
    shapes.push(text(ctx, { ...textArea, x: textArea.x + 0.35, w: textArea.w - 0.35 }, paras, { size, valign: "middle", lineSpacing: 1.2 }));
  }
  return { shapes };
}
