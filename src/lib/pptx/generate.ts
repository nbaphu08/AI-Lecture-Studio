import type PptxGenJS from "pptxgenjs";
import { AppError } from "@/lib/utils/errors";
import type { ComposedDeck, Gradient, Shadow, Shape } from "./draw";

type PptxSlide = ReturnType<PptxGenJS["addSlide"]>;

const PT_PER_IN = 72;

/**
 * PptxGenJS cannot write gradient fills. Each gradient is written as a unique flat placeholder color
 * that appears nowhere else in the deck, and swapped for real `<a:gradFill>` XML after generation.
 */
class GradientRegistry {
  readonly byColor = new Map<string, Gradient>();
  private next = 0;

  constructor(private readonly used: Set<string>) {}

  /** Placeholder color standing in for this gradient. */
  color(g: Gradient): string {
    for (const [color, o] of this.byColor) if (o.from === g.from && o.to === g.to && o.angle === g.angle) return color;
    let color: string;
    do color = (0xf1e2d3 + this.next++ * 7).toString(16).toUpperCase().padStart(6, "0");
    while (this.used.has(color));
    this.byColor.set(color, g);
    return color;
  }
}

function fillOf(s: { fill?: string; gradient?: Gradient; alpha?: number }, gradients: GradientRegistry) {
  if (s.gradient) return { color: gradients.color(s.gradient) };
  if (!s.fill) return { type: "none" as const };
  return s.alpha ? { color: s.fill, transparency: Math.round(s.alpha * 100) } : { color: s.fill };
}

function lineOf(line: { color: string; width: number; alpha?: number; dash?: "dash" | "dot" } | undefined) {
  if (!line) return { type: "none" as const };
  return {
    color: line.color,
    width: line.width,
    transparency: line.alpha ? Math.round(line.alpha * 100) : undefined,
    dashType: line.dash === "dot" ? ("sysDot" as const) : line.dash,
  };
}

function shadowOf(sh: Shadow | undefined) {
  if (!sh) return undefined;
  return { type: "outer" as const, color: sh.color ?? "000000", blur: sh.blur, offset: sh.offset, angle: sh.angle ?? 90, opacity: sh.opacity };
}

function addShape(pptx: PptxGenJS, slide: PptxSlide, s: Shape, gradients: GradientRegistry): void {
  switch (s.t) {
    case "rect": {
      const rounded = !!s.radius && s.radius > 0;
      slide.addShape(rounded ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        fill: fillOf(s, gradients),
        line: lineOf(s.line),
        shadow: shadowOf(s.shadow),
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
        fill: fillOf(s, gradients),
        line: lineOf(s.line),
        shadow: shadowOf(s.shadow),
      });
      break;
    case "poly": {
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xs) - x;
      const h = Math.max(...ys) - y;
      slide.addShape("custGeom" as PptxGenJS.ShapeType, {
        x,
        y,
        w,
        h,
        points: [
          ...s.points.map(([px, py], i) => ({ x: px - x, y: py - y, moveTo: i === 0 })),
          { close: true as const },
        ],
        fill: fillOf(s, gradients),
        line: lineOf(s.line),
        shadow: shadowOf(s.shadow),
      });
      break;
    }
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
        line: { color: s.color, width: s.width, endArrowType: s.arrow ? "triangle" : undefined, dashType: s.dash === "dot" ? "sysDot" : s.dash },
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
          transparency: s.alpha ? Math.round(s.alpha * 100) : undefined,
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
      slide.addImage({ data: s.src, x: s.x, y: s.y, w: s.w, h: s.h, altText: s.alt, shadow: shadowOf(s.shadow) });
      break;
    case "table": {
      const pad = 0.07 * PT_PER_IN;
      const none = { type: "none" as const };
      const rules: [PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps] = [
        none,
        none,
        { type: "solid", pt: 0.75, color: s.borderColor },
        none,
      ];
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
              border: s.rulesOnly ? rules : undefined,
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

function gradientXml(g: Gradient): string {
  return (
    '<a:gradFill rotWithShape="1"><a:gsLst>' +
    `<a:gs pos="0"><a:srgbClr val="${g.from}"/></a:gs>` +
    `<a:gs pos="100000"><a:srgbClr val="${g.to}"/></a:gs>` +
    `</a:gsLst><a:lin ang="${Math.round(g.angle * 60000)}" scaled="0"/></a:gradFill>`
  );
}

const SOLID_FILL = /<a:solidFill>\s*<a:srgbClr val="([0-9A-F]{6})"\s*(?:\/>|>[\s\S]*?<\/a:srgbClr>)\s*<\/a:solidFill>/g;

/** Swap the gradient placeholder fills for real gradient XML inside the generated package. */
async function applyGradients(data: ArrayBuffer | Uint8Array, gradients: Map<string, Gradient>): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  for (const name of names) {
    const xml = await zip.file(name)!.async("string");
    const next = xml.replace(SOLID_FILL, (match, hex: string) => {
      const g = gradients.get(hex);
      return g ? gradientXml(g) : match;
    });
    if (next !== xml) zip.file(name, next);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** Build the PowerPoint file. Works in the browser (Blob) and in Node tests (via `outputType`). */
export async function buildPptx(deck: ComposedDeck, meta: PptxMeta): Promise<{ pptx: PptxGenJS; gradients: Map<string, Gradient> }> {
  const { default: PptxGen } = await import("pptxgenjs");
  const pptx = new PptxGen();
  pptx.defineLayout({ name: "SLIDECRAFT", width: deck.w, height: deck.h });
  pptx.layout = "SLIDECRAFT";
  pptx.title = meta.title;
  pptx.subject = meta.title;
  pptx.company = "Created with SlideCraft";
  if (meta.author) pptx.author = meta.author;

  const used = new Set(JSON.stringify(deck).toUpperCase().match(/[0-9A-F]{6}/g) ?? []);
  const gradients = new GradientRegistry(used);
  for (const composed of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: composed.backgroundGradient ? gradients.color(composed.backgroundGradient) : composed.background };
    for (const shape of composed.shapes) addShape(pptx, slide, shape, gradients);
  }
  return { pptx, gradients: gradients.byColor };
}

/** Write the finished file, including gradient fills. */
export async function writePptx(deck: ComposedDeck, meta: PptxMeta, outputType: "uint8array" | "blob" = "uint8array"): Promise<Uint8Array | Blob> {
  const { pptx, gradients } = await buildPptx(deck, meta);
  const raw = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  const bytes = gradients.size ? await applyGradients(raw, gradients) : new Uint8Array(raw);
  if (outputType === "uint8array") return bytes;
  return new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}

export async function generatePptxBlob(deck: ComposedDeck, meta: PptxMeta): Promise<Blob> {
  try {
    return (await writePptx(deck, meta, "blob")) as Blob;
  } catch (error) {
    throw new AppError("generate-failed", "The PowerPoint file could not be created. Please try again or choose a different theme.", {
      cause: error,
    });
  }
}
