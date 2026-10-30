import { parseDocx } from "@/lib/docx/parser";
import type { ParsedDocument } from "@/lib/docx/types";
import { resolveSettings } from "@/lib/design/style-hints";
import { composeDeck } from "@/lib/pptx/compose";
import type { ComposedDeck } from "@/lib/pptx/draw";
import { generatePptxBlob } from "@/lib/pptx/generate";
import type { EffectiveSettings, PresentationSettings } from "@/lib/settings";
import { planSlides } from "@/lib/slides/planner";
import type { DeckPlan } from "@/lib/slides/types";
import { AppError } from "@/lib/utils/errors";
import { baseName, toFileStem } from "@/lib/utils/file-utils";

export type Stage = "reading" | "analyzing" | "planning" | "designing" | "exporting";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "reading", label: "Reading document" },
  { id: "analyzing", label: "Analyzing content" },
  { id: "planning", label: "Planning slides" },
  { id: "designing", label: "Designing presentation" },
  { id: "exporting", label: "Preparing PowerPoint" },
];

export interface GenerationResult {
  plan: DeckPlan;
  deck: ComposedDeck;
  blob: Blob;
  downloadName: string;
  settings: EffectiveSettings;
}

/** Let the browser paint progress updates between the synchronous pipeline stages. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 120));

export async function readDocument(file: File, onStage: (s: Stage) => void): Promise<ParsedDocument> {
  onStage("reading");
  await nextFrame();
  return parseDocx(file);
}

export async function buildPresentation(
  doc: ParsedDocument,
  fileName: string,
  rawSettings: PresentationSettings,
  onStage: (s: Stage) => void,
): Promise<GenerationResult> {
  onStage("analyzing");
  await nextFrame();
  const settings = resolveSettings(rawSettings);

  onStage("planning");
  await nextFrame();
  let plan: DeckPlan;
  try {
    plan = planSlides(doc, { density: settings.density, fileName, preferDiagrams: settings.preferDiagrams });
  } catch (error) {
    throw new AppError("plan-failed", "The document was read, but its structure could not be turned into slides.", { cause: error });
  }
  if (plan.slides.length <= 1) {
    throw new AppError("empty-document", "No usable content was found in this document, so there is nothing to put on slides.");
  }

  onStage("designing");
  await nextFrame();
  let deck: ComposedDeck;
  try {
    deck = composeDeck(plan, settings);
  } catch (error) {
    throw new AppError("generate-failed", "The slides could not be laid out with this design. Try another theme.", { cause: error });
  }

  onStage("exporting");
  await nextFrame();
  const blob = await generatePptxBlob(deck, { title: plan.title });
  const stem = toFileStem(plan.title, toFileStem(baseName(fileName)));
  return { plan, deck, blob, downloadName: `${stem}.pptx`, settings };
}
