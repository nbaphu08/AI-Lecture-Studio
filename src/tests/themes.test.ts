import { describe, expect, it } from "vitest";
import { luminance, mix } from "@/lib/design/color";
import { THEME_LIST, resolveTheme } from "@/lib/design/themes";

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const OVERRIDES = [{}, { background: "111827" }, { accent: "0F766E" }, { accent: "0F766E", background: "111827" }, { accent: "FACC15" }];

describe("themes", () => {
  it("keeps titles and hero text readable for every theme and override", () => {
    for (const t of THEME_LIST) {
      for (const o of OVERRIDES) {
        const { colors } = resolveTheme(t.id, o);
        const label = `${t.id} ${JSON.stringify(o)}`;
        expect(contrast(colors.heading, colors.background), `${label} heading`).toBeGreaterThanOrEqual(3);
        expect(contrast(colors.text, colors.background), `${label} text`).toBeGreaterThanOrEqual(4.5);
        // Hero text must be readable against both ends of the gradient, not just its middle.
        for (const end of [colors.gradFrom, colors.gradTo, mix(colors.gradFrom, colors.gradTo, 0.5)]) {
          expect(contrast(colors.onHero, end), `${label} hero ${end}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});
