/** Deterministic text heuristics used by the slide planner. No language model involved. */

const ABBREVIATIONS = /\b(?:e\.g|i\.e|vs|etc|dr|mr|mrs|ms|prof|fig|no|st|approx|cf|inc|ltd|u\.s|u\.k)\.$/i;

/** Split text into sentences without losing any characters other than the separating whitespace. */
export function splitSentences(text: string): string[] {
  const raw = text
    .trim()
    .split(/(?<=[.!?…]["”')\]]*)\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const piece of raw) {
    const prev = out[out.length - 1];
    const mergeWithPrev =
      prev !== undefined && (ABBREVIATIONS.test(prev) || /(?:^|\s)[A-Z]\.$/.test(prev) || /^[a-z]/.test(piece));
    if (mergeWithPrev) out[out.length - 1] = `${prev} ${piece}`;
    else out.push(piece);
  }
  return out;
}

/** Greedily pack pieces into groups whose joined length stays within `budget`. */
export function packByLength<T>(pieces: T[], budget: number, length: (p: T) => number, maxCount = Infinity): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const piece of pieces) {
    const len = length(piece);
    if (current.length > 0 && (size + len > budget || current.length >= maxCount)) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(piece);
    size += len;
  }
  if (current.length) groups.push(current);
  return groups;
}

/** Break overly long text into sentence-aligned pieces no longer than `max` where possible. */
export function splitLongText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = splitSentences(text);
  if (sentences.length < 2) return [text];
  return packByLength(sentences, max, (s) => s.length + 1).map((g) => g.join(" "));
}

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const YEAR = "(?:1[0-9]{3}|20[0-9]{2})";
const DATE = `(?:${MONTH}\\.?\\s+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s+)?)?${YEAR}s?(?:\\s*[–-]\\s*(?:${YEAR}|\\d{2}))?`;
const DATE_LEAD = new RegExp(`^(?:(?:In|By|During|Since|From|Around|Circa|On)\\s+)?(${DATE})(?=[\\s:,;.–—-]|$)\\s*[:,;–—-]?\\s*`, "i");

export interface DatedText {
  date: string;
  text: string;
}

/** If the text starts with a date ("In 1998, …", "2004: …", "March 2011 – …"), split it. */
export function extractLeadingDate(text: string): DatedText | null {
  const match = DATE_LEAD.exec(text.trim());
  if (!match) return null;
  const rest = text.trim().slice(match[0].length).trim();
  if (rest.length < 3) return null;
  return { date: match[1].trim(), text: rest };
}

export function extractTimeline(items: string[]): DatedText[] | null {
  const events = items.map(extractLeadingDate);
  return events.every((e): e is DatedText => e !== null) ? events : null;
}

const STEP_PREFIX = /^(?:step\s*\d+|\d{1,2}[.)])\s*[:.\-–—]?\s*/i;

/** Paragraphs that begin "Step 1:" / "1." etc. */
export function stripStepPrefix(text: string): string | null {
  const m = STEP_PREFIX.exec(text);
  if (!m) return null;
  const rest = text.slice(m[0].length).trim();
  return rest.length > 0 ? rest : null;
}

const SEQUENCE_MARKER = /^(?:first(?:ly)?|second(?:ly)?|third(?:ly)?|fourth|fifth|next|then|after that|afterwards|finally|lastly|last)\b/i;

/** Sentences marked with ordinal/sequence words (First, Then, Finally…). Returns sentences when convincing. */
export function extractSequenceSteps(text: string, minMarkers: number): string[] | null {
  const sentences = splitSentences(text);
  if (sentences.length < minMarkers) return null;
  const marked = sentences.filter((s) => SEQUENCE_MARKER.test(s)).length;
  const startsWithFirst = /^(?:first(?:ly)?|to begin|begin by)\b/i.test(sentences[0]);
  if (marked >= minMarkers && marked >= sentences.length - 1 && (startsWithFirst || minMarkers <= 2)) return sentences;
  return null;
}

const CONTRAST_START = /^(?:in contrast|on the other hand|conversely|by contrast|whereas|meanwhile)\b/i;

/** Split a paragraph into two sides at an explicit contrast sentence. */
export function splitComparison(text: string): { left: string[]; right: string[] } | null {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return null;
  const idx = sentences.findIndex((s, i) => i > 0 && CONTRAST_START.test(s));
  if (idx < 1) return null;
  return { left: sentences.slice(0, idx), right: sentences.slice(idx) };
}

export const COMPARISON_TITLE = /\b(?:vs\.?|versus|compar\w*|differences?|contrast\w*)\b/i;
export const CONCLUSION_TITLE = /^\s*(?:conclusions?|summary|in summary|key takeaways?|takeaways?|final thoughts|wrap[- ]?up|closing|recommendations?|next steps)\b/i;

export interface Definition {
  term: string;
  definition: string;
}

/** "**Term** – explanation" or "Term: explanation". */
export function extractDefinition(text: string, leadBold?: string): Definition | null {
  const sep = /^\s*[:–—-]\s*/;
  if (leadBold && text.startsWith(leadBold)) {
    const rest = text.slice(leadBold.length).replace(sep, "").trim();
    if (rest.length >= 20 && leadBold.split(/\s+/).length <= 6) return { term: leadBold.replace(/[:–—-]\s*$/, ""), definition: rest };
  }
  const m = /^([A-Z][\w'’/-]*(?:\s+[\w'’/-]+){0,4})\s*[:–—]\s+(.{20,})$/.exec(text);
  if (m) return { term: m[1], definition: m[2] };
  return null;
}

/** "Photosynthesis is the process…" — returns the subject if the sentence defines something short. */
export function extractDefinedSubject(text: string): string | null {
  const m = /^([A-Z][\w'’-]*(?:\s+[\w'’-]+){0,3})\s+(?:is|are|refers to|means|is defined as)\s+/.exec(text);
  return m ? m[1] : null;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
