import type { DeckPlan } from "@/lib/slides/types";

/** A tiny fixed deck used to render theme thumbnails in the settings panel. */
export const DEMO_PLAN: DeckPlan = {
  title: "Cell Biology",
  slides: [
    { id: "d1", kind: "cover", title: "Cell Biology", subtitle: "Lecture 1 — Structure and Function", sourceIds: [] },
    {
      id: "d2",
      kind: "bullets",
      title: "Key Organelles",
      section: "Foundations",
      bullets: ["The nucleus stores genetic material", "Mitochondria produce energy", "Ribosomes build proteins"],
      sourceIds: [],
    },
  ],
  coverage: { totalBlocks: 0, assigned: [], metadata: [], unsupported: [], recovered: [] },
  warnings: [],
};
