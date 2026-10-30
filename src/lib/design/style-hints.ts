import type { PresentationSettings, EffectiveSettings } from "@/lib/settings";
import type { ThemeId } from "./themes";

/**
 * A deliberately small keyword → settings mapper. It only recognizes the phrases listed below;
 * everything else in the text is ignored and the selected theme is used instead.
 */

interface Rule {
  label: string;
  pattern: RegExp;
  apply: (s: Mutable) => void;
}

interface Mutable {
  themeId?: ThemeId;
  accent?: string;
  background?: string;
  density?: PresentationSettings["density"];
  titleScale?: number;
  colorful?: boolean;
  preferDiagrams?: boolean;
}

const RULES: Rule[] = [
  { label: "academic", pattern: /\bacademic\b/i, apply: (s) => (s.themeId ??= "academic") },
  { label: "minimalist", pattern: /\bminimal(?:ist|istic)?\b/i, apply: (s) => (s.themeId ??= "minimalist") },
  { label: "modern", pattern: /\bmodern\b/i, apply: (s) => (s.themeId ??= "modern") },
  { label: "corporate", pattern: /\bcorporate\b/i, apply: (s) => (s.themeId ??= "corporate") },
  { label: "editorial", pattern: /\beditorial\b|\bmagazine\b/i, apply: (s) => (s.themeId ??= "editorial") },
  { label: "midnight", pattern: /\bmidnight\b|\bneon\b|\btech(?:nology)?\b/i, apply: (s) => (s.themeId ??= "midnight") },
  // Looser synonyms only apply when no theme was named explicitly.
  { label: "clean", pattern: /\bclean\b|\bsimple\b/i, apply: (s) => (s.themeId ??= "minimalist") },
  { label: "bold", pattern: /\bbold\b/i, apply: (s) => (s.themeId ??= "modern") },
  { label: "business", pattern: /\bbusiness\b|\bprofessional\b/i, apply: (s) => (s.themeId ??= "corporate") },
  { label: "dark", pattern: /\bdark(?:\s+(?:mode|background|theme))?\b|\bblack background\b/i, apply: (s) => (s.background = "111827") },
  { label: "white background", pattern: /\bwhite\s+background/i, apply: (s) => (s.background = "FFFFFF") },
  { label: "navy", pattern: /\bnavy\b/i, apply: (s) => (s.accent = "1E3A5F") },
  { label: "blue", pattern: /\bblue\b/i, apply: (s) => (s.accent ??= "2563EB") },
  { label: "green", pattern: /\bgreen\b/i, apply: (s) => (s.accent = "15803D") },
  { label: "red", pattern: /\bred\b/i, apply: (s) => (s.accent = "B91C1C") },
  { label: "purple", pattern: /\bpurple\b/i, apply: (s) => (s.accent = "6D28D9") },
  { label: "teal", pattern: /\bteal\b/i, apply: (s) => (s.accent = "0F766E") },
  { label: "orange", pattern: /\borange\b/i, apply: (s) => (s.accent = "C2410C") },
  {
    label: "warm",
    pattern: /\bwarm\b/i,
    apply: (s) => {
      s.accent ??= "B45309";
      s.background ??= "FBF5EC";
    },
  },
  { label: "colorful", pattern: /\bcolou?rful\b/i, apply: (s) => (s.colorful = true) },
  { label: "large titles", pattern: /\b(?:large|big|huge)\s+titles?\b/i, apply: (s) => (s.titleScale = 1.2) },
  { label: "more diagrams", pattern: /\bmore\s+(?:diagrams?|visuals?)\b|\bdiagrams?\b/i, apply: (s) => (s.preferDiagrams = true) },
  { label: "less text", pattern: /\bless\s+text\b|\bconcise\b|\bshort(?:er)?\s+text\b/i, apply: (s) => (s.density = "concise") },
  { label: "more text", pattern: /\bmore\s+text\b|\bdetailed\b/i, apply: (s) => (s.density = "detailed") },
];

const FILLER = new Set(
  "use with and the a an of in on for to style look looks like that this please make want need presentation slides slide simple clean preferred using have has be is are very quite more less some any all its it my our your background backgrounds titles title text diagrams layout design theme colors color".split(" "),
);

export interface StyleHintResult {
  recognized: string[];
  /** True when the text contains words we do not understand. */
  hasUnsupported: boolean;
  patch: Mutable;
}

export function parseStyleHint(text: string): StyleHintResult {
  const patch: Mutable = {};
  const recognized: string[] = [];
  let remaining = text;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      rule.apply(patch);
      recognized.push(rule.label);
      remaining = remaining.replace(new RegExp(rule.pattern.source, "gi"), " ");
    }
  }
  const leftovers = remaining
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !FILLER.has(w));
  return { recognized, hasUnsupported: leftovers.length > 0, patch };
}

/** Merge the optional description into the user's manual settings. */
export function resolveSettings(settings: PresentationSettings): EffectiveSettings {
  const { patch } = parseStyleHint(settings.styleHint);
  return {
    ...settings,
    themeId: patch.themeId ?? settings.themeId,
    accent: patch.accent ?? settings.accent,
    background: patch.background ?? settings.background,
    density: patch.density ?? settings.density,
    preferDiagrams: !!patch.preferDiagrams,
    overrides: {
      accent: patch.accent ?? settings.accent,
      background: patch.background ?? settings.background,
      font: settings.font,
      titleScale: patch.titleScale,
      colorful: patch.colorful,
    },
  };
}
