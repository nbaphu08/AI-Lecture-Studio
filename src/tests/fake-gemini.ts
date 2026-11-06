import type { JsonGenerator, JsonRequest } from "@/lib/ai/gemini-client";

/**
 * A deterministic stand-in for Gemini used in tests: it reads the sections out of the prompt and
 * answers in the requested JSON shape. It tests the application's plumbing, not Gemini's quality.
 */

export interface FakeOptions {
  /** Called for every request; return a string to override the answer, or undefined for the default. */
  override?: (request: JsonRequest, call: number) => string | undefined | Promise<string | undefined>;
  bulletsPerSlide?: number;
}

interface ParsedSection {
  id: string;
  heading?: string;
  lines: string[];
}

export function parseSections(prompt: string): ParsedSection[] {
  const source = prompt.split("<SOURCE>")[1]?.split("</SOURCE>")[0] ?? "";
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  for (const line of source.split("\n")) {
    const m = /^=== (section-\d+)(?: — "(.*)")?(?: \(continued\))? ===$/.exec(line);
    if (m) {
      current = { id: m[1], heading: m[2], lines: [] };
      sections.push(current);
    } else if (current) {
      const text = line
        .replace(/^\[[^\]]+\]\s*/, "")
        .replace(/^- \([^)]*\)\s*/, "")
        .replace(/^- /, "")
        .replace(/^Summary: /, "")
        .trim();
      if (text && !/^#+ /.test(text) && !/^(TABLE|LIST|NUMBERED LIST|IMAGE|DOCUMENT TITLE|Topic:)/.test(text)) current.lines.push(text);
    }
  }
  return sections;
}

export function fakeGemini(options: FakeOptions = {}): JsonGenerator & { calls: JsonRequest[] } {
  const calls: JsonRequest[] = [];
  const per = options.bulletsPerSlide ?? 4;
  const fn: JsonGenerator = async (request) => {
    calls.push(request);
    const forced = await options.override?.(request, calls.length);
    if (forced !== undefined) return forced;

    const sections = parseSections(request.prompt);
    if ("sections" in (request.jsonSchema as { properties: object }).properties) {
      return JSON.stringify({
        sections: sections.map((s) => ({
          sectionId: s.id,
          topic: s.heading ?? "Introduction",
          summary: s.lines[0] ?? "Empty section.",
          points: s.lines.slice(0, 6).map((text) => ({ kind: "concept", text, importance: "high" })),
        })),
      });
    }
    const ids = sections.map((s) => s.id);
    const slides = [{ id: "slide-001", layout: "title", title: "Generated Lecture", sourceSections: ids.slice(0, 1) }];
    sections.forEach((s) => {
      for (let i = 0; i < Math.max(1, Math.ceil(s.lines.length / per)); i++) {
        const content = s.lines.slice(i * per, (i + 1) * per).map((text) => ({ text, importance: "high" }));
        if (!content.length) continue;
        slides.push({
          id: `slide-${String(slides.length + 1).padStart(3, "0")}`,
          layout: "title-content",
          title: `${s.heading ?? "Overview"}${i ? ` (${i + 1})` : ""}`,
          content,
          sourceSections: [s.id],
        } as never);
      }
    });
    const last = sections[sections.length - 1];
    slides.push({
      id: `slide-${String(slides.length + 1).padStart(3, "0")}`,
      layout: "key-takeaways",
      title: "Key takeaways",
      content: (last?.lines.slice(0, 3) ?? ["Review the material."]).map((text) => ({ text, importance: "high" })),
      sourceSections: last ? [last.id] : [],
    } as never);
    return JSON.stringify({ presentationTitle: "Generated Lecture", subtitle: "From the source document", slides });
  };
  return Object.assign(fn, { calls });
}
