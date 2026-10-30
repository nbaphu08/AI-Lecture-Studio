/** Small color helpers. Colors are 6-digit hex strings WITHOUT the leading '#'. */

export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return h.toUpperCase();
}

function toRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function toHex([r, g, b]: [number, number, number]): string {
  return [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Linear blend: t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

export const tint = (hex: string, t: number) => mix(hex, "FFFFFF", t);
export const shade = (hex: string, t: number) => mix(hex, "000000", t);

export function luminance(hex: string): number {
  const lin = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function isDark(hex: string): boolean {
  return luminance(hex) < 0.35;
}

/** Pick black-ish or white text for the given background. */
export function readableOn(bg: string, dark = "1F2937", light = "FFFFFF"): string {
  return isDark(bg) ? light : dark;
}
