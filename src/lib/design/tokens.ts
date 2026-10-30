export type AspectRatio = "16:9" | "4:3";

export const SLIDE_SIZES: Record<AspectRatio, { w: number; h: number }> = {
  "16:9": { w: 13.333, h: 7.5 },
  "4:3": { w: 10, h: 7.5 },
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Grid {
  w: number;
  h: number;
  /** Safe margins. */
  marginX: number;
  marginTop: number;
  marginBottom: number;
  /** The full content area inside the margins. */
  content: Rect;
  /** Scale factor for font sizes relative to the 16:9 design (narrower slides get slightly smaller type). */
  fontScale: number;
}

export function makeGrid(aspect: AspectRatio): Grid {
  const { w, h } = SLIDE_SIZES[aspect];
  const marginX = aspect === "16:9" ? 0.8 : 0.65;
  const marginTop = 0.55;
  const marginBottom = 0.6;
  return {
    w,
    h,
    marginX,
    marginTop,
    marginBottom,
    content: { x: marginX, y: marginTop, w: w - marginX * 2, h: h - marginTop - marginBottom },
    fontScale: aspect === "16:9" ? 1 : 0.92,
  };
}
