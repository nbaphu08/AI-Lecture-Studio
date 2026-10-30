import type { Shadow } from "@/lib/pptx/draw";
import { isDark, luminance, mix, normalizeHex, readableOn, shade, tint } from "./color";

export type ThemeId = "academic" | "minimalist" | "modern" | "corporate" | "editorial" | "midnight";
export type Decor = ThemeId;
export type FontKey = "theme" | "calibri" | "arial" | "georgia" | "cambria" | "trebuchet" | "verdana" | "times";

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    /** Cards and panels. */
    surface: string;
    /** Slide titles. */
    heading: string;
    text: string;
    mutedText: string;
    border: string;
    /** Text color on top of the primary color. */
    onPrimary: string;
    /** Hero gradient used on covers, section dividers and feature panels. */
    gradFrom: string;
    gradTo: string;
  };
  fonts: { heading: string; body: string };
  /** Point sizes at the 16:9 slide width. */
  sizes: { coverTitle: number; sectionTitle: number; title: number; subtitle: number; body: number; small: number; label: number };
  /** Corner radius in inches for cards. */
  radius: number;
  /** Spacing scale in inches. */
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  divider: "line" | "bar" | "double" | "none";
  decor: Decor;
  /** Card treatment: a soft shadow (or glow), and whether cards get a hairline border. */
  look: { shadow: Shadow | null; cardBorder: boolean };
  /** Rotating colors for cards when the "colorful" preference is on. */
  palette: string[];
}

const spacing = { xs: 0.08, sm: 0.16, md: 0.3, lg: 0.5, xl: 0.8 };
const softShadow: Shadow = { blur: 14, offset: 3, opacity: 0.12, color: "0F172A" };

export const THEMES: Record<ThemeId, Theme> = {
  academic: {
    id: "academic",
    name: "Academic",
    description: "Navy and gold with serif titles, for lectures and coursework.",
    colors: {
      primary: "1B365D",
      secondary: "3F6C9E",
      accent: "C1932F",
      background: "FFFFFF",
      surface: "F5F7FB",
      heading: "1B365D",
      text: "1F2937",
      mutedText: "5B6575",
      border: "DCE3EC",
      onPrimary: "FFFFFF",
      gradFrom: "0F2341",
      gradTo: "2A5288",
    },
    fonts: { heading: "Georgia", body: "Calibri" },
    sizes: { coverTitle: 46, sectionTitle: 42, title: 30, subtitle: 20, body: 20, small: 14, label: 12 },
    radius: 0.1,
    spacing,
    divider: "line",
    decor: "academic",
    look: { shadow: softShadow, cardBorder: false },
    palette: ["1B365D", "3F6C9E", "C1932F", "5B7F95"],
  },
  minimalist: {
    id: "minimalist",
    name: "Minimalist",
    description: "Generous white space, crisp type and one quiet accent.",
    colors: {
      primary: "111827",
      secondary: "6B7280",
      accent: "2563EB",
      background: "FFFFFF",
      surface: "F7F7F6",
      heading: "111827",
      text: "1F2937",
      mutedText: "6B7280",
      border: "E5E7EB",
      onPrimary: "FFFFFF",
      gradFrom: "111827",
      gradTo: "374151",
    },
    fonts: { heading: "Arial", body: "Arial" },
    sizes: { coverTitle: 50, sectionTitle: 44, title: 30, subtitle: 20, body: 19, small: 14, label: 11 },
    radius: 0,
    spacing,
    divider: "none",
    decor: "minimalist",
    look: { shadow: null, cardBorder: true },
    palette: ["111827", "2563EB", "6B7280", "9CA3AF"],
  },
  modern: {
    id: "modern",
    name: "Modern",
    description: "Vivid violet gradients, rounded cards and bold type.",
    colors: {
      primary: "5B21B6",
      secondary: "7C3AED",
      accent: "F59E0B",
      background: "FAFAFC",
      surface: "FFFFFF",
      heading: "2E1065",
      text: "18181B",
      mutedText: "52525B",
      border: "E9E5F5",
      onPrimary: "FFFFFF",
      gradFrom: "4C1D95",
      gradTo: "C026D3",
    },
    fonts: { heading: "Trebuchet MS", body: "Trebuchet MS" },
    sizes: { coverTitle: 52, sectionTitle: 48, title: 32, subtitle: 22, body: 20, small: 14, label: 12 },
    radius: 0.2,
    spacing,
    divider: "bar",
    decor: "modern",
    look: { shadow: { blur: 22, offset: 5, opacity: 0.14, color: "4C1D95" }, cardBorder: false },
    palette: ["7C3AED", "F59E0B", "0EA5E9", "EC4899"],
  },
  corporate: {
    id: "corporate",
    name: "Corporate",
    description: "Confident blue header bands and clean business structure.",
    colors: {
      primary: "0F4C81",
      secondary: "2F7DB8",
      accent: "F08A24",
      background: "FFFFFF",
      surface: "F2F6FA",
      heading: "0F2E4F",
      text: "1E293B",
      mutedText: "586374",
      border: "D7E0EA",
      onPrimary: "FFFFFF",
      gradFrom: "0A3560",
      gradTo: "1F6FB2",
    },
    fonts: { heading: "Calibri", body: "Calibri" },
    sizes: { coverTitle: 46, sectionTitle: 42, title: 28, subtitle: 20, body: 20, small: 14, label: 12 },
    radius: 0.06,
    spacing,
    divider: "bar",
    decor: "corporate",
    look: { shadow: softShadow, cardBorder: false },
    palette: ["0F4C81", "2F7DB8", "F08A24", "4B8F7A"],
  },
  editorial: {
    id: "editorial",
    name: "Editorial",
    description: "Magazine-style serif typography on warm paper.",
    colors: {
      primary: "2B2B2B",
      secondary: "7A6A58",
      accent: "B3402A",
      background: "FBF8F3",
      surface: "F3EDE3",
      heading: "1F1F1F",
      text: "262626",
      mutedText: "6B645B",
      border: "DDD3C3",
      onPrimary: "FBF8F3",
      gradFrom: "9E3522",
      gradTo: "C2553A",
    },
    fonts: { heading: "Georgia", body: "Georgia" },
    sizes: { coverTitle: 50, sectionTitle: 46, title: 32, subtitle: 20, body: 18, small: 13, label: 11 },
    radius: 0,
    spacing,
    divider: "double",
    decor: "editorial",
    look: { shadow: null, cardBorder: true },
    palette: ["B3402A", "2B2B2B", "7A6A58", "3C6E71"],
  },
  midnight: {
    id: "midnight",
    name: "Midnight",
    description: "Dark, high-contrast tech look with glowing cyan accents.",
    colors: {
      primary: "6366F1",
      secondary: "A78BFA",
      accent: "22D3EE",
      background: "0B1023",
      surface: "141B38",
      heading: "F8FAFC",
      text: "E2E8F0",
      mutedText: "94A3C4",
      border: "27315A",
      onPrimary: "FFFFFF",
      gradFrom: "4338CA",
      gradTo: "0891B2",
    },
    fonts: { heading: "Arial", body: "Calibri" },
    sizes: { coverTitle: 50, sectionTitle: 46, title: 30, subtitle: 20, body: 20, small: 14, label: 12 },
    radius: 0.14,
    spacing,
    divider: "bar",
    decor: "midnight",
    look: { shadow: { blur: 24, offset: 0, opacity: 0.35, color: "000000" }, cardBorder: true },
    palette: ["22D3EE", "A78BFA", "6366F1", "F472B6"],
  },
};

export const THEME_LIST = Object.values(THEMES);

export const FONT_OPTIONS: { key: FontKey; label: string; family?: string }[] = [
  { key: "theme", label: "Theme default" },
  { key: "calibri", label: "Calibri", family: "Calibri" },
  { key: "arial", label: "Arial", family: "Arial" },
  { key: "georgia", label: "Georgia", family: "Georgia" },
  { key: "cambria", label: "Cambria", family: "Cambria" },
  { key: "trebuchet", label: "Trebuchet MS", family: "Trebuchet MS" },
  { key: "verdana", label: "Verdana", family: "Verdana" },
  { key: "times", label: "Times New Roman", family: "Times New Roman" },
];

export interface ThemeOverrides {
  /** Hex without '#'. Replaces the primary/accent colors of the theme. */
  accent?: string | null;
  /** Hex without '#'. Replaces the slide background. */
  background?: string | null;
  font?: FontKey;
  /** Multiplier for title sizes ("large titles"). */
  titleScale?: number;
  /** Cards rotate through the palette instead of one accent color. */
  colorful?: boolean;
}

export interface ResolvedTheme extends Omit<Theme, "colors"> {
  /** Theme colors plus `onHero`: text color on top of the hero gradient. */
  colors: Theme["colors"] & { onHero: string };
  titleScale: number;
  colorful: boolean;
  /** True when the slide background is dark. */
  dark: boolean;
}

export function resolveTheme(id: ThemeId, overrides: ThemeOverrides = {}): ResolvedTheme {
  const base = THEMES[id];
  const colors = { ...base.colors };
  let palette = base.palette;

  const accent = overrides.accent ? normalizeHex(overrides.accent) : null;
  if (accent) {
    colors.primary = accent;
    colors.secondary = mix(accent, "FFFFFF", 0.25);
    colors.accent = accent;
    colors.onPrimary = readableOn(accent);
    colors.heading = isDark(colors.background) ? colors.heading : shade(accent, 0.35);
    colors.gradFrom = shade(accent, 0.35);
    colors.gradTo = mix(accent, "FFFFFF", 0.15);
    palette = [accent, mix(accent, "808080", 0.35), shade(accent, 0.3), tint(accent, 0.35)];
  }

  const bg = overrides.background ? normalizeHex(overrides.background) : null;
  if (bg) {
    colors.background = bg;
    const dark = isDark(bg);
    colors.text = readableOn(bg, "1F2937", "F8FAFC");
    colors.mutedText = dark ? tint(bg, 0.65) : mix(colors.text, bg, 0.4);
    colors.surface = dark ? tint(bg, 0.08) : shade(bg, 0.04);
    colors.border = dark ? tint(bg, 0.2) : shade(bg, 0.12);
  }
  // Dark backgrounds need a visible primary: lighten dark primaries.
  const darkBg = isDark(colors.background);
  colors.heading = darkBg ? (isDark(colors.heading) ? "F8FAFC" : colors.heading) : isDark(colors.heading) ? colors.heading : colors.primary;
  if (darkBg && luminance(colors.accent) < 0.2) colors.accent = tint(colors.accent, 0.45);
  if (darkBg && isDark(colors.primary) && (bg || accent)) {
    colors.primary = tint(colors.primary, 0.55);
    colors.secondary = tint(colors.secondary, 0.35);
    colors.onPrimary = readableOn(colors.primary);
    palette = palette.map((c) => (isDark(c) ? tint(c, 0.5) : c));
  }

  let fonts = base.fonts;
  const font = FONT_OPTIONS.find((f) => f.key === overrides.font);
  if (font?.family) fonts = { heading: font.family, body: font.family };

  const heroMid = mix(colors.gradFrom, colors.gradTo, 0.5);
  const onHero = isDark(heroMid) ? (isDark(colors.onPrimary) ? "FFFFFF" : colors.onPrimary) : "1F2937";

  return {
    ...base,
    colors: { ...colors, onHero },
    palette,
    fonts,
    titleScale: overrides.titleScale ?? 1,
    colorful: !!overrides.colorful,
    dark: darkBg,
  };
}
