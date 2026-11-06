import type { DocumentBlock, ParsedDocument } from "@/lib/docx/types";

type Draft = DocumentBlock extends infer B ? (B extends unknown ? Omit<B, "id"> : never) : never;

export function makeDoc(drafts: Draft[], warnings: string[] = []): ParsedDocument {
  const blocks = drafts.map((b, i) => ({ ...b, id: `b${i}` }) as DocumentBlock);
  const title = blocks.find((b) => b.type === "title");
  return { title: title && title.type === "title" ? title.text : undefined, blocks, warnings };
}

export const h = (level: 1 | 2 | 3, text: string): Draft => ({ type: "heading", level, text });
export const p = (text: string): Draft => ({ type: "paragraph", text });
export const ul = (...items: string[]): Draft => ({ type: "list", ordered: false, items });
export const ol = (...items: string[]): Draft => ({ type: "list", ordered: true, items });
export const table = (headers: string[] | undefined, rows: string[][]): Draft => ({ type: "table", headers, rows });

/** 1. A short lecture. */
export const shortLecture = () =>
  makeDoc([
    { type: "title", text: "Introduction to Photosynthesis" },
    h(1, "What is photosynthesis?"),
    p("Photosynthesis is the process by which plants convert light energy into chemical energy. It takes place in the chloroplasts."),
    h(1, "The two stages"),
    ul("Light-dependent reactions occur in the thylakoid membranes.", "The Calvin cycle occurs in the stroma."),
    h(1, "Summary"),
    p("Plants turn light, water and carbon dioxide into glucose and oxygen."),
  ]);

/** 2. A long lecture with many chapters. */
export const longLecture = (chapters = 40) => {
  const d: Draft[] = [{ type: "title", text: "Survey of World History" }];
  for (let c = 1; c <= chapters; c++) {
    d.push(h(1, `Chapter ${c}: Period ${c}`));
    for (let s = 1; s <= 3; s++) {
      d.push(h(2, `Topic ${c}.${s}`));
      d.push(
        p(
          `In period ${c}, topic ${s} is explained at length. ${"Historians describe the political, economic and social changes of the era in detail. ".repeat(8)}The key idea ${c}-${s} is that change accumulates gradually.`,
        ),
      );
    }
  }
  return makeDoc(d);
};

/** 3. A document with tables. */
export const tableDoc = () =>
  makeDoc([
    { type: "title", text: "Planets Overview" },
    h(1, "Inner planets"),
    p("The table lists basic facts about the four inner planets."),
    table(["Planet", "Diameter (km)", "Moons"], [["Mercury", "4,879", "0"], ["Venus", "12,104", "0"], ["Earth", "12,742", "1"], ["Mars", "6,779", "2"]]),
    h(1, "Comparison"),
    p("Earth is the only planet known to support life."),
  ]);

/** 4. A document containing numerical data. */
export const numericDoc = () =>
  makeDoc([
    { type: "title", text: "Quarterly Sales Review" },
    h(1, "Results"),
    p("Sales were 120 in Q1, 150 in Q2, 180 in Q3 and 210 in Q4, a rise of 75% over the year."),
    table(["Quarter", "Sales"], [["Q1", "120"], ["Q2", "150"], ["Q3", "180"], ["Q4", "210"]]),
    h(1, "Outlook"),
    p("Management expects 12.5% growth next year if costs stay below 3,400 per unit."),
  ]);

/** 5. Long technical explanations. */
export const technicalDoc = () =>
  makeDoc([
    { type: "title", text: "TCP Congestion Control" },
    h(1, "Slow start and congestion avoidance"),
    p(
      "TCP maintains a congestion window (cwnd) that limits the number of unacknowledged bytes in flight. During slow start, cwnd roughly doubles every round-trip time until it reaches the slow start threshold (ssthresh). " +
        "After that, TCP enters congestion avoidance and increases cwnd by about one maximum segment size per round-trip time. When a loss is detected through a timeout, ssthresh is set to half of cwnd and cwnd is reset to one segment; " +
        "when three duplicate acknowledgements arrive, fast retransmit and fast recovery are used instead, which avoids returning to slow start. The additive-increase multiplicative-decrease behaviour converges to a fair share of the bottleneck link.",
    ),
    h(2, "Fast recovery"),
    p("Fast recovery inflates cwnd by one segment for every duplicate acknowledgement and deflates it when new data is acknowledged."),
  ]);

/** 6. Repeated information. */
export const repeatedDoc = () =>
  makeDoc([
    { type: "title", text: "Recycling Basics" },
    h(1, "Why recycle?"),
    p("Recycling reduces waste and saves energy."),
    h(1, "Benefits"),
    p("Recycling reduces waste and saves energy."),
    h(1, "Recap"),
    p("Recycling reduces waste and saves energy."),
  ]);
