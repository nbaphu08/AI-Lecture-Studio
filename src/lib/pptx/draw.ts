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

/** Two-stop linear gradient. `angle` follows PowerPoint: 0 = left→right, 90 = top→bottom. */
export interface Gradient {
  from: string;
  to: string;
  angle: number;
}

/** Soft drop shadow. `offset` is in points, `blur` in points, `opacity` 0–1. */
export interface Shadow {
  blur: number;
  offset: number;
  opacity: number;
  color?: string;
  /** Direction in degrees (PowerPoint: 90 = straight down). Defaults to 90. */
  angle?: number;
}

interface Paint {
  fill?: string;
  /** Overrides `fill` with a gradient. */
  gradient?: Gradient;
  /** Fill transparency, 0 (opaque) to 1 (invisible). */
  alpha?: number;
  line?: { color: string; width: number; alpha?: number; dash?: "dash" | "dot" };
  shadow?: Shadow;
}

export type Shape =
  | ({
      t: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      /** Corner radius in inches (0 = square). */
      radius?: number;
    } & Paint)
  | ({ t: "ellipse"; x: number; y: number; w: number; h: number } & Paint)
  /** Closed polygon; `points` are absolute slide coordinates in inches. */
  | ({ t: "poly"; points: Array<[number, number]> } & Paint)
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; arrow?: boolean; dash?: "dash" | "dot" }
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
      /** Text transparency, 0 (opaque) to 1 (invisible). */
      alpha?: number;
    }
  | { t: "image"; x: number; y: number; w: number; h: number; src: string; alt?: string; shadow?: Shadow }
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
      /** Only horizontal rules between rows (no vertical grid lines). */
      rulesOnly?: boolean;
    };

export interface ComposedSlide {
  background: string;
  /** Replaces the flat background when present. */
  backgroundGradient?: Gradient;
  shapes: Shape[];
  /** Plain-text version for speaker notes / accessibility. */
  title: string;
}

export interface ComposedDeck {
  w: number;
  h: number;
  slides: ComposedSlide[];
}
