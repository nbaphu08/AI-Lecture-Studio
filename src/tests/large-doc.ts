import type { Part } from "../../scripts/docx-builder.ts";

/**
 * Deterministic synthetic lecture generator for large-document tests. The text is varied (different
 * subjects, names and numbers per chapter) so summaries are not trivially repetitive, but it is
 * synthetic: it tests pipeline behaviour, not summarization quality on real lectures.
 */
const SUBJECTS = [
  "river hydrology", "medieval trade routes", "cell respiration", "interest-rate policy", "bridge engineering", "coral reef ecology",
  "printing technology", "urban transport planning", "soil chemistry", "early radio broadcasting", "forest fire management",
  "vaccine logistics", "glacier mass balance", "textile manufacturing", "satellite navigation", "irrigation economics",
  "ocean shipping", "language acquisition", "wind-farm siting", "public health surveillance", "metal recycling", "volcano monitoring",
  "library cataloguing", "airport scheduling",
];
const VERBS = ["measured", "recorded", "reported", "estimated", "observed"];
const NOUNS = ["stations", "sites", "regions", "institutions", "teams", "cases"];

function sentence(subject: string, c: number, s: number, k: number): string {
  const n = 12 + ((c * 7 + s * 13 + k * 17) % 90);
  const year = 1850 + ((c * 11 + s * 5 + k * 3) % 170);
  const verb = VERBS[(c + s + k) % VERBS.length];
  const noun = NOUNS[(c * 3 + k) % NOUNS.length];
  return `In ${year}, researchers of ${subject} ${verb} ${n} ${noun} and found that variation of about ${(n % 9) + 1}.${k % 10} percent depended on local conditions (case ${c}-${s}-${k}).`;
}

export function bigLectureParts(chapters: number, opts: { headings?: boolean; paragraphsPerTopic?: number; topics?: number } = {}): Part[] {
  const { headings = true, paragraphsPerTopic = 4, topics = 3 } = opts;
  const parts: Part[] = [{ kind: "title", text: "Applied Systems Lecture Series" }];
  for (let c = 1; c <= chapters; c++) {
    const subject = SUBJECTS[(c - 1) % SUBJECTS.length];
    if (headings) parts.push({ kind: "heading", level: 1, text: `Chapter ${c}: ${subject[0].toUpperCase()}${subject.slice(1)}` });
    for (let s = 1; s <= topics; s++) {
      if (headings) parts.push({ kind: "heading", level: 2, text: `${c}.${s} Key issue ${s} in ${subject}` });
      for (let p = 0; p < paragraphsPerTopic; p++) {
        parts.push({ kind: "p", text: Array.from({ length: 5 }, (_, k) => sentence(subject, c, s, p * 5 + k)).join(" ") });
      }
      if (s === 1) parts.push({ kind: "ul", items: [`Definition ${c}.${s}: ${subject} studies how conditions change over time.`, `Rule of thumb ${c}: check ${12 + c} indicators before concluding.`, `Example ${c}: a ${20 + c}-year dataset from ${NOUNS[c % NOUNS.length]}.`] });
    }
    if (c % 4 === 0) {
      parts.push({ kind: "table", header: true, rows: [["Period", "Measured value", "Unit"], [`${1900 + c}`, `${100 + c * 3}`, "mm"], [`${1910 + c}`, `${120 + c * 4}`, "mm"], [`${1920 + c}`, `${140 + c * 2}`, "mm"]] });
    }
  }
  return parts;
}
