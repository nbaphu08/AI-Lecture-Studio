/** Text measurement helpers. These are estimates; real renderers differ slightly, so layouts leave headroom. */

/** Average glyph width as a fraction of the font size, per font family. */
const CHAR_WIDTH: Record<string, number> = {
  Georgia: 0.53,
  "Times New Roman": 0.47,
  Cambria: 0.5,
  Calibri: 0.48,
  Arial: 0.53,
  Verdana: 0.6,
  "Trebuchet MS": 0.52,
};

export function charWidthFactor(font: string, bold = false): number {
  return (CHAR_WIDTH[font] ?? 0.53) * (bold ? 1.06 : 1);
}

export interface MeasureOptions {
  font: string;
  size: number;
  width: number;
  lineSpacing?: number;
  bold?: boolean;
  /** Extra indent (inches) consumed by bullets/numbers. */
  indent?: number;
}

/** Estimated number of wrapped lines for a string in a box of given width (inches). */
export function estimateLines(text: string, o: MeasureOptions): number {
  const usable = Math.max(0.5, o.width - (o.indent ?? 0));
  const charW = (o.size / 72) * charWidthFactor(o.font, o.bold);
  const perLine = Math.max(1, Math.floor(usable / charW));
  let lines = 0;
  for (const raw of text.split("\n")) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    let current = 0;
    let count = 1;
    for (const word of words) {
      const len = word.length;
      if (current === 0) current = len;
      else if (current + 1 + len <= perLine) current += 1 + len;
      else {
        count++;
        current = len;
      }
      while (current > perLine) {
        count++;
        current -= perLine;
      }
    }
    lines += count;
  }
  return lines;
}

/** A font's natural line height relative to its size; PowerPoint's spacing multiple applies on top of this. */
export const NATURAL_LINE_HEIGHT = 1.2;

/** Estimated height in inches of a stack of paragraphs. */
export function estimateHeight(paragraphs: string[], o: MeasureOptions, paragraphGap = 0): number {
  const lineH = (o.size / 72) * NATURAL_LINE_HEIGHT * (o.lineSpacing ?? 1);
  const lines = paragraphs.reduce((n, p) => n + estimateLines(p, o), 0);
  return lines * lineH + Math.max(0, paragraphs.length - 1) * paragraphGap;
}

export interface FitResult {
  size: number;
  height: number;
  fits: boolean;
}

/** Largest font size in [min, max] (step 1pt) at which the paragraphs fit in `maxHeight`. */
export function fitFontSize(
  paragraphs: string[],
  o: Omit<MeasureOptions, "size">,
  maxHeight: number,
  max: number,
  min: number,
  paragraphGapFactor = 0.35,
): FitResult {
  for (let size = Math.floor(max); size >= min; size--) {
    const gap = (size / 72) * paragraphGapFactor * 1.2;
    const height = estimateHeight(paragraphs, { ...o, size }, gap);
    if (height <= maxHeight) return { size, height, fits: true };
  }
  const gap = (min / 72) * paragraphGapFactor * 1.2;
  return { size: min, height: estimateHeight(paragraphs, { ...o, size: min }, gap), fits: false };
}

/** Truncate for tight labels only (never used for body content). */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
