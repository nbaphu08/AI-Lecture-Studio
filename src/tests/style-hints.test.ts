import { describe, expect, it } from "vitest";
import { parseStyleHint, resolveSettings } from "@/lib/design/style-hints";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { resolveTheme } from "@/lib/design/themes";

describe("style hints", () => {
  it("maps the example description to settings", () => {
    const r = parseStyleHint("Use navy blue, white backgrounds, large titles, simple diagrams, and a clean academic style.");
    expect(r.recognized).toEqual(expect.arrayContaining(["academic", "navy", "white background", "large titles", "more diagrams"]));
    expect(r.patch.themeId).toBe("academic");
    expect(r.patch.accent).toBe("1E3A5F");
    expect(r.hasUnsupported).toBe(false);
  });

  it("flags unsupported requests and leaves the selected theme alone", () => {
    const r = parseStyleHint("add animated 3D transitions with music");
    expect(r.recognized).toEqual([]);
    expect(r.hasUnsupported).toBe(true);
    expect(resolveSettings({ ...DEFAULT_SETTINGS, themeId: "editorial", styleHint: "add music" }).themeId).toBe("editorial");
  });

  it("maps 'less text' to concise density and 'more diagrams' to diagram preference", () => {
    const s = resolveSettings({ ...DEFAULT_SETTINGS, styleHint: "less text, more diagrams" });
    expect(s.density).toBe("concise");
    expect(s.preferDiagrams).toBe(true);
  });

  it("keeps text readable on dark backgrounds", () => {
    const t = resolveTheme("academic", { background: "111827" });
    expect(t.dark).toBe(true);
    expect(t.colors.text).toBe("F8FAFC");
  });
});
