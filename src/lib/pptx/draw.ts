/**
 * Renderer-independent drawing primitives. Layouts produce these; both the PptxGenJS writer and the
 * HTML preview consume them, so the preview and the exported file share one layout.
 * All coordinates are in inches; font sizes in points.
 */

export interface Para {
  text: string;
  bullet?: "dot" | "number";
  bold?: boolean;
  italic?: boolean;
  color?: string;
  size?: number;
  /** Space after the paragraph in points. */
  spaceAfter?: number;
}

export type Shape =
  | {
      t: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      line?: { color: string; width: number };
      /** Corner radius in inches (0 = square). */
      radius?: number;
    }
  | { t: "ellipse"; x: number; y: number; w: number; h: number; fill?: string; line?: { color: string; width: number } }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; arrow?: boolean }
  | {
      t: "text";
      x: number;
      y: number;
      w: number;
      h: number;
      paras: Para[];
      size: number;
      color: string;
      font: string;
      bold?: boolean;
      italic?: boolean;
      align?: "left" | "center" | "right";
      valign?: "top" | "middle" | "bottom";
      lineSpacing?: number;
      /** Letter spacing in points (used for small caps labels). */
      charSpacing?: number;
      uppercase?: boolean;
    }
  | { t: "image"; x: number; y: number; w: number; h: number; src: string; alt?: string }
  | {
      t: "table";
      x: number;
      y: number;
      w: number;
      colW: number[];
      rowH: number[];
      cells: string[][];
      hasHeader: boolean;
      font: string;
      size: number;
      textColor: string;
      headerFill: string;
      headerColor: string;
      zebraFill: string;
      bodyFill: string;
      borderColor: string;
    };

export interface ComposedSlide {
  background: string;
  shapes: Shape[];
  /** Plain-text version for speaker notes / accessibility. */
  title: string;
}

export interface ComposedDeck {
  w: number;
  h: number;
  slides: ComposedSlide[];
}
