import { isDark, luminance, mix, normalizeHex, readableOn, shade, tint } from "./color";

export type ThemeId = "academic" | "minimalist" | "modern" | "corporate" | "editorial";
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
    text: string;
    mutedText: string;
    border: string;
    /** Text color on top of the primary color. */
    onPrimary: string;
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
  /** Rotating colors for cards when the "colorful" preference is on. */
  palette: string[];
}

const spacing = { xs: 0.08, sm: 0.16, md: 0.3, lg: 0.5, xl: 0.8 };

export const THEMES: Record<ThemeId, Theme> = {
  academic: {
    id: "academic",
    name: "Academic",
    description: "Professional and structured, for lectures and coursework.",
    colors: {
      primary: "1E3A5F",
      secondary: "3F6C9E",
      accent: "B8892B",
      background: "FFFFFF",
      surface: "F3F6FA",
      text: "1F2937",
      mutedText: "5B6575",
      border: "D5DCE6",
      onPrimary: "FFFFFF",
    },
    fonts: { heading: "Georgia", body: "Calibri" },
    sizes: { coverTitle: 44, sectionTitle: 40, title: 30, subtitle: 20, body: 20, small: 14, label: 12 },
    radius: 0.08,
    spacing,
    divider: "line",
    decor: "academic",
    palette: ["1E3A5F", "3F6C9E", "B8892B", "5B7F95"],
  },
  minimalist: {
    id: "minimalist",
    name: "Minimalist",
    description: "Clean, white and spacious with a single quiet accent.",
    colors: {
      primary: "111827",
      secondary: "6B7280",
      accent: "2563EB",
      background: "FFFFFF",
      surface: "F6F6F5",
      text: "1F2937",
      mutedText: "6B7280",
      border: "E5E7EB",
      onPrimary: "FFFFFF",
    },
    fonts: { heading: "Arial", body: "Arial" },
    sizes: { coverTitle: 48, sectionTitle: 40, title: 28, subtitle: 20, body: 19, small: 14, label: 11 },
    radius: 0,
    spacing,
    divider: "none",
    decor: "minimalist",
    palette: ["111827", "2563EB", "6B7280", "9CA3AF"],
  },
  modern: {
    id: "modern",
    name: "Modern",
    description: "Bold typography with a vivid, contemporary palette.",
    colors: {
      primary: "5B21B6",
      secondary: "7C3AED",
      accent: "F59E0B",
      background: "FAFAFB",
      surface: "FFFFFF",
      text: "18181B",
      mutedText: "52525B",
      border: "E4E4E7",
      onPrimary: "FFFFFF",
    },
    fonts: { heading: "Trebuchet MS", body: "Trebuchet MS" },
    sizes: { coverTitle: 50, sectionTitle: 46, title: 32, subtitle: 22, body: 20, small: 14, label: 12 },
    radius: 0.18,
    spacing,
    divider: "bar",
    decor: "modern",
    palette: ["5B21B6", "F59E0B", "0EA5E9", "EC4899"],
  },
  corporate: {
    id: "corporate",
    name: "Corporate",
    description: "Structured business style with clear header bands.",
    colors: {
      primary: "0F4C81",
      secondary: "2F7DB8",
      accent: "E07A1F",
      background: "FFFFFF",
      surface: "EEF3F8",
      text: "1E293B",
      mutedText: "586374",
      border: "D3DCE6",
      onPrimary: "FFFFFF",
    },
    fonts: { heading: "Calibri", body: "Calibri" },
    sizes: { coverTitle: 44, sectionTitle: 40, title: 28, subtitle: 20, body: 20, small: 14, label: 12 },
    radius: 0.04,
    spacing,
    divider: "bar",
    decor: "corporate",
    palette: ["0F4C81", "2F7DB8", "E07A1F", "4B8F7A"],
  },
  editorial: {
    id: "editorial",
    name: "Editorial",
    description: "Refined serif typography inspired by magazine layouts.",
    colors: {
      primary: "2B2B2B",
      secondary: "7A6A58",
      accent: "B3402A",
      background: "FBF8F3",
      surface: "F2ECE2",
      text: "262626",
      mutedText: "6B645B",
      border: "DDD3C3",
      onPrimary: "FBF8F3",
    },
    fonts: { heading: "Georgia", body: "Georgia" },
    sizes: { coverTitle: 46, sectionTitle: 42, title: 30, subtitle: 20, body: 18, small: 13, label: 11 },
    radius: 0,
    spacing,
    divider: "double",
    decor: "editorial",
    palette: ["B3402A", "2B2B2B", "7A6A58", "3C6E71"],
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

export interface ResolvedTheme extends Theme {
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
  if (darkBg && luminance(colors.accent) < 0.2) colors.accent = tint(colors.accent, 0.45);
  if (darkBg && isDark(colors.primary)) {
    colors.primary = tint(colors.primary, 0.55);
    colors.secondary = tint(colors.secondary, 0.35);
    colors.onPrimary = readableOn(colors.primary);
    palette = palette.map((c) => (isDark(c) ? tint(c, 0.5) : c));
  }

  let fonts = base.fonts;
  const font = FONT_OPTIONS.find((f) => f.key === overrides.font);
  if (font?.family) fonts = { heading: font.family, body: font.family };

  return {
    ...base,
    colors,
    palette,
    fonts,
    titleScale: overrides.titleScale ?? 1,
    colorful: !!overrides.colorful,
    dark: darkBg,
  };
}
