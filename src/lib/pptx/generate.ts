import type PptxGenJS from "pptxgenjs";
import { AppError } from "@/lib/utils/errors";
import type { ComposedDeck, Shape } from "./draw";

type PptxSlide = ReturnType<PptxGenJS["addSlide"]>;

const PT_PER_IN = 72;

function addShape(pptx: PptxGenJS, slide: PptxSlide, s: Shape): void {
  switch (s.t) {
    case "rect": {
      const rounded = !!s.radius && s.radius > 0;
      slide.addShape(rounded ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        fill: s.fill ? { color: s.fill } : { type: "none" },
        line: s.line ? { color: s.line.color, width: s.line.width } : { type: "none" },
        // PowerPoint expresses the corner radius as a fraction of the shorter side.
        rectRadius: rounded ? Math.min(0.5, s.radius! / Math.min(s.w, s.h)) : undefined,
      });
      break;
    }
    case "ellipse":
      slide.addShape(pptx.ShapeType.ellipse, {
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        fill: s.fill ? { color: s.fill } : { type: "none" },
        line: s.line ? { color: s.line.color, width: s.line.width } : { type: "none" },
      });
      break;
    case "line": {
      const flipH = s.x2 < s.x1;
      const flipV = s.y2 < s.y1;
      slide.addShape(pptx.ShapeType.line, {
        x: Math.min(s.x1, s.x2),
        y: Math.min(s.y1, s.y2),
        w: Math.abs(s.x2 - s.x1),
        h: Math.abs(s.y2 - s.y1),
        flipH,
        flipV,
        line: { color: s.color, width: s.width, endArrowType: s.arrow ? "triangle" : undefined },
      });
      break;
    }
    case "text": {
      const runs = s.paras.map((p, i) => ({
        text: s.uppercase ? p.text.toUpperCase() : p.text,
        options: {
          breakLine: i < s.paras.length - 1,
          bullet: p.bullet === "dot" ? { indent: 18 } : p.bullet === "number" ? { type: "number" as const, indent: 22 } : undefined,
          bold: p.bold ?? s.bold,
          italic: p.italic ?? s.italic,
          color: p.color ?? s.color,
          fontSize: p.size ?? s.size,
          paraSpaceAfter: p.spaceAfter,
        },
      }));
      slide.addText(runs, {
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        fontFace: s.font,
        fontSize: s.size,
        color: s.color,
        bold: s.bold,
        italic: s.italic,
        align: s.align ?? "left",
        valign: s.valign ?? "top",
        lineSpacingMultiple: s.lineSpacing,
        charSpacing: s.charSpacing,
        margin: 0,
        fit: "shrink",
        wrap: true,
      });
      break;
    }
    case "image":
      slide.addImage({ data: s.src, x: s.x, y: s.y, w: s.w, h: s.h, altText: s.alt });
      break;
    case "table": {
      const pad = 0.07 * PT_PER_IN;
      const rows = s.cells.map((row, r) =>
        row.map((cell) => {
          const header = s.hasHeader && r === 0;
          const zebra = !header && (s.hasHeader ? r % 2 === 0 : r % 2 === 1);
          return {
            text: cell,
            options: {
              bold: header,
              color: header ? s.headerColor : s.textColor,
              fill: { color: header ? s.headerFill : zebra ? s.zebraFill : s.bodyFill },
            },
          };
        }),
      );
      slide.addTable(rows, {
        x: s.x,
        y: s.y,
        w: s.w,
        colW: s.colW,
        rowH: s.rowH,
        fontFace: s.font,
        fontSize: s.size,
        valign: "middle",
        margin: [pad, pad * 1.4, pad, pad * 1.4],
        border: { type: "solid", pt: 0.75, color: s.borderColor },
        autoPage: false,
      });
      break;
    }
  }
}

export interface PptxMeta {
  title: string;
  author?: string;
}

/** Build the PowerPoint file. Works in the browser (Blob) and in Node tests (via `outputType`). */
export async function buildPptx(deck: ComposedDeck, meta: PptxMeta): Promise<PptxGenJS> {
  const { default: PptxGen } = await import("pptxgenjs");
  const pptx = new PptxGen();
  pptx.defineLayout({ name: "SLIDECRAFT", width: deck.w, height: deck.h });
  pptx.layout = "SLIDECRAFT";
  pptx.title = meta.title;
  pptx.subject = meta.title;
  pptx.company = "Created with SlideCraft";
  if (meta.author) pptx.author = meta.author;

  for (const composed of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: composed.background };
    for (const shape of composed.shapes) addShape(pptx, slide, shape);
  }
  return pptx;
}

export async function generatePptxBlob(deck: ComposedDeck, meta: PptxMeta): Promise<Blob> {
  try {
    const pptx = await buildPptx(deck, meta);
    return (await pptx.write({ outputType: "blob" })) as Blob;
  } catch (error) {
    throw new AppError("generate-failed", "The PowerPoint file could not be created. Please try again or choose a different theme.", {
      cause: error,
    });
  }
}
