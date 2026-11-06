import { planSchema, type AiPlan, type AiSlide } from "./schemas";

/**
 * Turns the model's raw text into a trustworthy plan, or a list of problems.
 * Nothing the model says is used before it passes through `validatePlan`.
 */

export interface ValidationContext {
  sectionIds: Set<string>;
  /** Block ids of TABLE blocks in the source. */
  tableIds: Set<string>;
  /** Block ids of IMAGE blocks in the source. */
  imageIds: Set<string>;
  /** Plain text of the whole original document, used to check numbers. */
  sourceText: string;
  /** Normalized numbers of the original document; used instead of `sourceText` when the text is not available. */
  numbers?: Set<string>;
}

export interface ValidationResult {
  plan?: AiPlan;
  /** Problems that justify asking the model to try again. */
  problems: string[];
  /** Things we repaired or removed ourselves; shown to the user as a heads-up. */
  warnings: string[];
}

export function stripJsonFences(raw: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(raw.trim());
  return (fenced ? fenced[1] : raw).trim();
}

export function parseJson(raw: string): { value?: unknown; problem?: string } {
  try {
    return { value: JSON.parse(stripJsonFences(raw)) };
  } catch {
    return { problem: "The answer was not valid JSON." };
  }
}

// ---- Numbers -------------------------------------------------------------------------------------------

/** Numbers in a text, normalized so "1,200" and "1200" compare equal. */
export function extractNumbers(text: string): string[] {
  const clean = text.replace(/\[[^\]\n]{1,40}\]/g, " ").replace(/section-\d+/gi, " ");
  const out: string[] = [];
  for (const m of clean.matchAll(/\d+(?:[.,]\d+)*/g)) out.push(normalizeNumber(m[0]));
  return out;
}

export function normalizeNumber(token: string): string {
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(token)) return token.replace(/,/g, "");
  return token.replace(",", ".");
}

export function numberSet(text: string): Set<string> {
  return new Set(extractNumbers(text));
}

/** All text a viewer would read on a slide (not notes). */
export function aiSlideText(s: AiSlide, includeNotes = false): string {
  return [
    s.title,
    s.keyMessage,
    ...(s.content ?? []).map((c) => c.text),
    ...(s.columns ?? []).flatMap((c) => [c.heading, ...c.items]),
    ...(s.steps ?? []),
    ...(s.events ?? []).flatMap((e) => [e.date, e.text]),
    ...(s.table ? [...(s.table.headers ?? []), ...s.table.rows.flat()] : []),
    s.term,
    s.definition,
    ...(s.questions ?? []),
    includeNotes ? s.speakerNotes : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function hasContent(s: AiSlide): boolean {
  const layout = s.layout.toLowerCase();
  if (layout === "title" || layout === "section-divider" || layout === "section") return true;
  return !!(
    s.content?.length ||
    s.columns?.some((c) => c.items.length) ||
    s.steps?.length ||
    s.events?.length ||
    s.table?.rows.length ||
    s.tableRef ||
    s.chart ||
    (s.term && s.definition) ||
    s.imageRef ||
    s.questions?.length
  );
}

// ---- Validation ----------------------------------------------------------------------------------------

export function validatePlan(raw: string, ctx: ValidationContext): ValidationResult {
  const parsed = parseJson(raw);
  if (parsed.problem) return { problems: [parsed.problem], warnings: [] };

  const result = planSchema.safeParse(parsed.value);
  if (!result.success) {
    const problems = result.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return { problems, warnings: [] };
  }

  const plan: AiPlan = result.data;
  const warnings: string[] = [];
  const problems: string[] = [];
  const source = ctx.numbers ?? (ctx.sourceText ? numberSet(ctx.sourceText) : null);

  // Unique ids: renumbering is harmless, so repair silently.
  const seen = new Set<string>();
  plan.slides.forEach((s, i) => {
    if (seen.has(s.id)) s.id = `slide-${String(i + 1).padStart(3, "0")}-${i}`;
    seen.add(s.id);
  });

  const unknownSections = new Set<string>();
  plan.slides.forEach((s) => {
    const known = s.sourceSections.filter((id) => ctx.sectionIds.has(id));
    s.sourceSections.filter((id) => !ctx.sectionIds.has(id)).forEach((id) => unknownSections.add(id));
    s.sourceSections = Array.from(new Set(known));

    if (s.tableRef && !ctx.tableIds.has(s.tableRef)) {
      warnings.push(`Slide "${s.title}" referred to a table that does not exist; it was ignored.`);
      s.tableRef = undefined;
    }
    if (s.imageRef && !ctx.imageIds.has(s.imageRef)) {
      warnings.push(`Slide "${s.title}" referred to an image that does not exist; it was ignored.`);
      s.imageRef = undefined;
    }

    if (s.chart) {
      const c = s.chart;
      const consistent = c.series.every((x) => x.values.length === c.categories.length) && (c.chartType !== "pie" || c.series.length === 1);
      const grounded = !source || c.series.every((x) => x.values.every((v) => source.has(normalizeNumber(String(v)))));
      if (!consistent) {
        warnings.push(`The chart on slide "${s.title}" had inconsistent data and was not used.`);
        s.chart = undefined;
      } else if (!grounded) {
        warnings.push(`The chart on slide "${s.title}" used numbers that are not in the source document, so it was not used.`);
        s.chart = undefined;
      }
    }

    // Numbers the model may have invented. These are warnings: some are legitimate (counts, step numbers).
    if (source) {
      const odd = Array.from(new Set(extractNumbers(aiSlideText(s)))).filter(
        (n) => (n.length >= 2 || n.includes(".")) && !source.has(n),
      );
      if (odd.length) {
        warnings.push(`Slide "${s.title}" mentions ${odd.slice(0, 3).join(", ")}, which could not be found in the source document. Please check it.`);
      }
    }
  });
  if (unknownSections.size) warnings.push("Some slides pointed to sections that do not exist; those references were removed.");

  const empty = plan.slides.filter((s) => !hasContent(s));
  if (empty.length) {
    problems.push(...empty.slice(0, 8).map((s) => `Slide "${s.title}" (${s.id}) has layout "${s.layout}" but none of the content its layout needs.`));
  }
  return { plan, problems, warnings };
}

/** After a failed repair: keep the useful slides and report the dropped ones. */
export function dropEmptySlides(plan: AiPlan): { plan: AiPlan; warnings: string[] } {
  const keep = plan.slides.filter(hasContent);
  const dropped = plan.slides.length - keep.length;
  return {
    plan: { ...plan, slides: keep },
    warnings: dropped ? [`${dropped} slide(s) the AI proposed had no content and were left out.`] : [],
  };
}
