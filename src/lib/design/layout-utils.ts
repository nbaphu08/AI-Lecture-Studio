import type { Rect } from "./tokens";

/** Split a rect into `n` equal columns separated by `gap`. */
export function columns(area: Rect, n: number, gap: number): Rect[] {
  const w = (area.w - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: area.x + i * (w + gap), y: area.y, w, h: area.h }));
}

/** Split a rect into `n` equal rows separated by `gap`. */
export function rows(area: Rect, n: number, gap: number): Rect[] {
  const h = (area.h - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: area.x, y: area.y + i * (h + gap), w: area.w, h }));
}

export function inset(r: Rect, dx: number, dy = dx): Rect {
  return { x: r.x + dx, y: r.y + dy, w: r.w - dx * 2, h: r.h - dy * 2 };
}

/** Fit an image of aspect `ratio` (w/h) inside `box`, centered. */
export function containRect(box: Rect, ratio: number): Rect {
  let w = box.w;
  let h = w / ratio;
  if (h > box.h) {
    h = box.h;
    w = h * ratio;
  }
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
