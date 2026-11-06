import * as z from "zod";

/**
 * Data contracts for what Gemini returns. Every response is parsed with these Zod schemas before
 * anything else happens; the JSON schemas below only *ask* the model for the same shape.
 */

export const LAYOUTS = [
  "title",
  "section-divider",
  "title-content",
  "definition",
  "two-column",
  "text-image",
  "comparison",
  "process",
  "timeline",
  "chart",
  "table",
  "key-takeaways",
  "quiz",
] as const;
export type Layout = (typeof LAYOUTS)[number];

export const IMPORTANCE = ["high", "medium", "low"] as const;
export type Importance = (typeof IMPORTANCE)[number];

/** Treat null (which models sometimes emit for "absent") like a missing value. */
const maybe = <T extends z.ZodType>(schema: T) => schema.nullish().transform((v): z.output<T> | undefined => v ?? undefined);

const importance = z.enum(IMPORTANCE).nullish().transform((v) => v ?? "medium");
const str = (max: number) => z.string().trim().max(max);
const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

const columnSchema = z.object({ heading: maybe(str(200)), items: z.array(nonEmpty(1_200)).max(30) });

export const chartSchema = z.object({
  chartType: z.enum(["bar", "line", "pie"]),
  categories: z.array(nonEmpty(120)).min(2).max(30),
  series: z.array(z.object({ name: nonEmpty(120), values: z.array(z.number()).min(2).max(30) })).min(1).max(6),
  unit: maybe(str(40)),
});

export const slideSchema = z.object({
  id: nonEmpty(60),
  /** Not restricted to LAYOUTS here: unknown values are mapped to a supported layout by the design engine. */
  layout: nonEmpty(60),
  title: nonEmpty(200),
  keyMessage: maybe(str(600)),
  content: maybe(z.array(z.object({ text: nonEmpty(1_500), importance })).max(40)),
  columns: maybe(z.array(columnSchema).max(4)),
  steps: maybe(z.array(nonEmpty(600)).max(30)),
  events: maybe(z.array(z.object({ date: nonEmpty(80), text: nonEmpty(600) })).max(30)),
  table: maybe(z.object({ headers: maybe(z.array(str(300)).max(40)), rows: z.array(z.array(str(600)).max(40)).max(200) })),
  /** Block id of a table in the source document, preferred over retyping its cells. */
  tableRef: maybe(str(40)),
  chart: maybe(chartSchema),
  term: maybe(str(200)),
  definition: maybe(str(1_500)),
  /** Block id of an image in the source document. */
  imageRef: maybe(str(40)),
  questions: maybe(z.array(nonEmpty(600)).max(20)),
  sourceSections: z.array(nonEmpty(40)).max(60).nullish().transform((v) => v ?? []),
  visualSuggestion: maybe(z.object({ type: str(60), description: maybe(str(400)) })),
  speakerNotes: maybe(str(3_000)),
});
export type AiSlide = z.infer<typeof slideSchema>;

export const planSchema = z.object({
  presentationTitle: nonEmpty(200),
  subtitle: maybe(str(300)),
  subject: maybe(str(120)),
  language: maybe(str(60)),
  learningObjectives: maybe(z.array(nonEmpty(400)).max(20)),
  slides: z.array(slideSchema).min(1).max(250),
});
export type AiPlan = z.infer<typeof planSchema>;

/** Result of analyzing one chunk of a long document. */
export const digestSchema = z.object({
  sections: z
    .array(
      z.object({
        sectionId: nonEmpty(40),
        topic: maybe(str(300)),
        summary: str(2_500),
        learningObjectives: maybe(z.array(nonEmpty(400)).max(10)),
        points: z
          .array(
            z.object({
              kind: z.enum(["concept", "definition", "example", "data", "process", "comparison", "timeline", "conclusion", "other"]),
              term: maybe(str(200)),
              text: nonEmpty(1_800),
              importance,
              sourceBlocks: maybe(z.array(nonEmpty(40)).max(20)),
            }),
          )
          .max(80),
      }),
    )
    .min(1)
    .max(80),
});
export type ChunkDigest = z.infer<typeof digestSchema>;

// ---- JSON schemas sent to Gemini (structured output) ------------------------------------------------
// Gemini supports a subset of JSON Schema, so these are hand-written and kept shallow. Constraints that
// are stripped by the API (maxLength, …) are enforced by the Zod schemas above instead.

const S = { type: "string" } as const;
const arr = (items: object) => ({ type: "array", items });
const obj = (properties: Record<string, object>, required: string[] = []) => ({ type: "object", properties, required });

const slideJson = obj(
  {
    id: S,
    layout: { type: "string", enum: [...LAYOUTS] },
    title: S,
    keyMessage: S,
    content: arr(obj({ text: S, importance: { type: "string", enum: [...IMPORTANCE] } }, ["text"])),
    columns: arr(obj({ heading: S, items: arr(S) }, ["items"])),
    steps: arr(S),
    events: arr(obj({ date: S, text: S }, ["date", "text"])),
    table: obj({ headers: arr(S), rows: arr(arr(S)) }, ["rows"]),
    tableRef: S,
    chart: obj(
      {
        chartType: { type: "string", enum: ["bar", "line", "pie"] },
        categories: arr(S),
        series: arr(obj({ name: S, values: arr({ type: "number" }) }, ["name", "values"])),
        unit: S,
      },
      ["chartType", "categories", "series"],
    ),
    term: S,
    definition: S,
    imageRef: S,
    questions: arr(S),
    sourceSections: arr(S),
    visualSuggestion: obj({ type: S, description: S }, ["type"]),
    speakerNotes: S,
  },
  ["id", "layout", "title", "sourceSections"],
);

export const PLAN_JSON_SCHEMA = obj(
  {
    presentationTitle: S,
    subtitle: S,
    subject: S,
    language: S,
    learningObjectives: arr(S),
    slides: arr(slideJson),
  },
  ["presentationTitle", "slides"],
);

export const DIGEST_JSON_SCHEMA = obj(
  {
    sections: arr(
      obj(
        {
          sectionId: S,
          topic: S,
          summary: S,
          learningObjectives: arr(S),
          points: {
            type: "array",
            maxItems: 12,
            items: obj(
              {
                kind: { type: "string", enum: ["concept", "definition", "example", "data", "process", "comparison", "timeline", "conclusion", "other"] },
                term: S,
                text: S,
                importance: { type: "string", enum: [...IMPORTANCE] },
                sourceBlocks: arr(S),
              },
              ["kind", "text", "importance"],
            ),
          },
        },
        ["sectionId", "summary", "points"],
      ),
    ),
  },
  ["sections"],
);
