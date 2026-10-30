import { resolveTheme } from "@/lib/design/themes";
import { makeGrid } from "@/lib/design/tokens";
import type { EffectiveSettings } from "@/lib/settings";
import type { DeckPlan, Slide } from "@/lib/slides/types";
import type { ComposedDeck } from "./draw";
import type { LayoutResult } from "./layouts/chrome";
import { comparisonLayout } from "./layouts/comparison";
import { conclusionLayout } from "./layouts/conclusion";
import { bulletsLayout, contentLayout } from "./layouts/content";
import { coverLayout } from "./layouts/cover";
import { definitionLayout } from "./layouts/definition";
import { imageTextLayout } from "./layouts/image-text";
import { processLayout } from "./layouts/process";
import { sectionLayout } from "./layouts/section-divider";
import type { Ctx } from "./layouts/shared";
import { tableLayout } from "./layouts/table";
import { timelineLayout } from "./layouts/timeline";
import { twoColumnLayout } from "./layouts/two-column";

function layoutFor(slide: Slide, ctx: Ctx): LayoutResult {
  switch (slide.kind) {
    case "cover":
      return coverLayout(slide, ctx);
    case "section":
      return sectionLayout(slide, ctx);
    case "content":
      return contentLayout(slide, ctx);
    case "bullets":
      return bulletsLayout(slide, ctx);
    case "twoColumn":
      return twoColumnLayout(slide, ctx);
    case "definition":
      return definitionLayout(slide, ctx);
    case "process":
      return processLayout(slide, ctx);
    case "timeline":
      return timelineLayout(slide, ctx);
    case "comparison":
      return comparisonLayout(slide, ctx);
    case "table":
      return tableLayout(slide, ctx);
    case "imageText":
      return imageTextLayout(slide, ctx);
    case "conclusion":
      return conclusionLayout(slide, ctx);
  }
}

/** Turn a slide plan into positioned shapes. The preview and the PPTX writer both consume this. */
export function composeDeck(plan: DeckPlan, settings: EffectiveSettings): ComposedDeck {
  const theme = resolveTheme(settings.themeId, settings.overrides);
  const grid = makeGrid(settings.aspect);
  const slides = plan.slides.map((slide, index) => {
    const ctx: Ctx = {
      theme,
      grid,
      showNumber: settings.showSlideNumbers && slide.kind !== "cover",
      showLabel: settings.showSectionLabels,
      index,
      total: plan.slides.length,
      deckTitle: plan.title,
      sz: (pt) => Math.round(pt * grid.fontScale * 10) / 10,
    };
    const result = layoutFor(slide, ctx);
    return { background: result.background ?? theme.colors.background, shapes: result.shapes, title: slide.title };
  });
  return { w: grid.w, h: grid.h, slides };
}
