import type { Slide } from "@/lib/slides/types";
import { containRect, columns } from "@/lib/design/layout-utils";
import { frame, type LayoutResult } from "./chrome";
import { fit, text, type Ctx } from "./shared";
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
  const imgBox = containRect({ ...imgArea, h: imgArea.h - captionH }, ratio);
  shapes.push({ t: "image", ...imgBox, src: slide.image.src, alt: caption });
  if (caption) {
    shapes.push(
      text(ctx, { x: imgArea.x, y: imgBox.y + imgBox.h + 0.08, w: imgArea.w, h: captionH - 0.08 }, [caption], {
        size: ctx.sz(theme.sizes.small),
        color: theme.colors.mutedText,
        italic: true,
        align: "center",
      }),
    );
  }

  if (textArea) {
    const texts = [...slide.paragraphs, ...slide.bullets];
    const size = fit(ctx, texts, textArea, { bullet: slide.bullets.length > 0 });
    const paras: Para[] = [
      ...slide.paragraphs.map((t) => ({ text: t, spaceAfter: Math.round(size * 0.42) })),
      ...slide.bullets.map((t) => ({ text: t, bullet: "dot" as const, spaceAfter: Math.round(size * 0.42) })),
    ];
    shapes.push(text(ctx, textArea, paras, { size, valign: "middle" }));
  }
  return { shapes };
}
