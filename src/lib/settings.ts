import type { AspectRatio } from "@/lib/design/tokens";
import type { FontKey, ThemeId, ThemeOverrides } from "@/lib/design/themes";
import type { Density } from "@/lib/slides/types";

export interface PresentationSettings {
  themeId: ThemeId;
  /** Hex without '#', or null to keep the theme's own colors. */
  accent: string | null;
  background: string | null;
  font: FontKey;
  aspect: AspectRatio;
  density: Density;
  showSlideNumbers: boolean;
  showSectionLabels: boolean;
  styleHint: string;
}

export const DEFAULT_SETTINGS: PresentationSettings = {
  themeId: "academic",
  accent: null,
  background: null,
  font: "theme",
  aspect: "16:9",
  density: "balanced",
  showSlideNumbers: true,
  showSectionLabels: true,
  styleHint: "",
};

/** Settings after the optional style description has been applied. */
export interface EffectiveSettings extends PresentationSettings {
  overrides: ThemeOverrides;
  preferDiagrams: boolean;
}
