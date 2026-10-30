import { resolveSettings } from "@/lib/design/style-hints";
import { THEMES, type ThemeId } from "@/lib/design/themes";
import { composeDeck } from "@/lib/pptx/compose";
import type { ComposedDeck } from "@/lib/pptx/draw";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { DeckPlan, Slide } from "@/lib/slides/types";

/** A sample lecture rendered with one theme on the landing page. */
export interface Showcase {
  themeId: ThemeId;
  /** Course the sample lecture belongs to, shown next to the template name. */
  subject: string;
  /** What the template is good for, in one sentence. */
  pitch: string;
  /** Short traits shown as tags. */
  traits: string[];
  plan: DeckPlan;
}

const EMPTY_COVERAGE: DeckPlan["coverage"] = { totalBlocks: 0, assigned: [], metadata: [], unsupported: [], recovered: [] };

/** A slide without the bookkeeping fields, keeping each slide kind's own properties. */
type SlideContent = Slide extends infer S ? (S extends Slide ? Omit<S, "id" | "sourceIds"> : never) : never;

/** Gives each slide an id and the shared empty source list the planner would normally fill. */
function deck(title: string, slides: SlideContent[]): DeckPlan {
  return {
    title,
    slides: slides.map((s, i) => ({ ...s, id: `${title}-${i}`, sourceIds: [] }) as Slide),
    coverage: EMPTY_COVERAGE,
    warnings: [],
  };
}

/**
 * Fixed sample lectures, one per showcased theme. They are composed with the real layout engine,
 * so the landing page shows exactly what the studio produces.
 */
export const SHOWCASES: Showcase[] = [
  {
    themeId: "academic",
    subject: "Economics",
    pitch: "Navy and gold with serif titles. Calm, credible and built for lecture halls and thesis defenses.",
    traits: ["Serif headings", "Gold accents", "Lecture-ready"],
    plan: deck("Principles of Microeconomics", [
      { kind: "cover", title: "Principles of Microeconomics", subtitle: "Lecture 4 — Supply, Demand and Market Equilibrium" },
      {
        kind: "definition",
        title: "Key Concept",
        section: "Markets",
        term: "Market equilibrium",
        definition: "The price at which the quantity buyers want to purchase equals the quantity sellers want to supply, so there is no pressure for the price to change.",
      },
      {
        kind: "bullets",
        title: "What Shifts Demand",
        section: "Markets",
        bullets: ["Changes in consumer income and preferences", "Prices of substitutes and complements", "Expectations about future prices"],
      },
      {
        kind: "conclusion",
        title: "Key Takeaways",
        points: ["Prices coordinate the decisions of buyers and sellers", "Shifts in supply or demand move the equilibrium", "Price controls create shortages or surpluses"],
      },
    ]),
  },
  {
    themeId: "modern",
    subject: "Computer Science",
    pitch: "Vivid violet gradients, rounded cards and bold type for workshops and project pitches.",
    traits: ["Gradient covers", "Rounded cards", "Bold type"],
    plan: deck("Introduction to Machine Learning", [
      { kind: "cover", title: "Introduction to Machine Learning", subtitle: "Week 2 — From Data to Predictions" },
      {
        kind: "process",
        title: "The Machine Learning Workflow",
        section: "Foundations",
        startAt: 1,
        steps: ["Collect and label the data", "Clean and prepare features", "Train the model", "Evaluate on unseen data", "Deploy and monitor"],
      },
      {
        kind: "comparison",
        title: "Supervised vs Unsupervised",
        section: "Foundations",
        left: { heading: "Supervised", items: ["Learns from labeled examples", "Predicts a known target", "Classification and regression"] },
        right: { heading: "Unsupervised", items: ["Finds structure in unlabeled data", "No target variable", "Clustering and dimensionality reduction"] },
      },
      {
        kind: "bullets",
        title: "Where Machine Learning Is Used",
        section: "Applications",
        bullets: ["Medical image diagnosis", "Fraud detection in banking", "Recommendation systems", "Real-time language translation"],
      },
    ]),
  },
  {
    themeId: "corporate",
    subject: "Business",
    pitch: "Confident blue header bands and clean structure for case studies, reports and business classes.",
    traits: ["Header bands", "Data tables", "Board-room clean"],
    plan: deck("Strategic Marketing Management", [
      { kind: "cover", title: "Strategic Marketing Management", subtitle: "Module 3 — Building a Go-to-Market Plan" },
      {
        kind: "table",
        title: "Customer Segments at a Glance",
        section: "Market Research",
        headers: ["Segment", "Share of market", "Annual growth", "Priority"],
        rows: [
          ["University students", "34%", "+8%", "High"],
          ["Young professionals", "27%", "+12%", "High"],
          ["Freelancers and creators", "14%", "+15%", "High"],
          ["Small businesses", "13%", "+5%", "Medium"],
          ["Schools and training centers", "7%", "+4%", "Medium"],
          ["Enterprises", "5%", "+2%", "Low"],
        ],
      },
      {
        kind: "process",
        title: "From Insight to Launch",
        section: "Planning",
        startAt: 1,
        steps: ["Define the target customer", "Position against competitors", "Set pricing and channels", "Launch and measure"],
      },
      {
        kind: "conclusion",
        title: "Recommendations",
        points: ["Focus the launch on students and young professionals", "Lead with value, not with discounts", "Review channel performance every quarter"],
      },
    ]),
  },
  {
    themeId: "editorial",
    subject: "Art History",
    pitch: "Magazine-style serif typography on warm paper for the humanities, literature and storytelling.",
    traits: ["Warm paper", "Magazine type", "Timelines"],
    plan: deck("A History of Modern Art", [
      { kind: "cover", title: "A History of Modern Art", subtitle: "Lecture 6 — The Avant-Garde, 1870–1940" },
      {
        kind: "timeline",
        title: "Movements That Changed Art",
        section: "The Avant-Garde",
        events: [
          { date: "1874", text: "The Impressionists hold their first independent exhibition in Paris" },
          { date: "1907", text: "Picasso paints Les Demoiselles d’Avignon, opening the way to Cubism" },
          { date: "1916", text: "Dada emerges in Zurich as a reaction to the First World War" },
          { date: "1924", text: "André Breton publishes the first Surrealist Manifesto" },
        ],
      },
      {
        kind: "content",
        title: "On Seeing",
        section: "The Avant-Garde",
        paragraphs: ["“Art does not reproduce the visible; rather, it makes visible.” — Paul Klee, 1920"],
      },
      {
        kind: "conclusion",
        title: "Key Takeaways",
        points: ["Modern art broke with realistic representation", "Each movement answered the one before it", "War and technology reshaped what art could be"],
      },
    ]),
  },
  {
    themeId: "midnight",
    subject: "Cybersecurity",
    pitch: "A dark, high-contrast stage with glowing cyan accents for tech talks and engineering demos.",
    traits: ["Dark stage", "Glow accents", "High contrast"],
    plan: deck("Cybersecurity Fundamentals", [
      { kind: "cover", title: "Cybersecurity Fundamentals", subtitle: "Session 5 — Defending Modern Networks" },
      {
        kind: "bullets",
        title: "The CIA Triad",
        section: "Core Principles",
        bullets: ["Confidentiality: only authorized people can read data", "Integrity: data cannot be altered unnoticed", "Availability: systems stay up when needed"],
      },
      {
        kind: "process",
        title: "Incident Response Lifecycle",
        section: "Operations",
        startAt: 1,
        steps: ["Prepare", "Detect and analyze", "Contain the threat", "Eradicate and recover", "Learn from it"],
      },
      {
        kind: "definition",
        title: "Key Concept",
        section: "Architecture",
        term: "Zero Trust",
        definition: "Never trust, always verify. Every request is authenticated and authorized, whether it comes from inside or outside the network.",
      },
    ]),
  },
];

export interface ComposedShowcase extends Showcase {
  name: string;
  deck: ComposedDeck;
}

/** The showcases laid out with their theme's default settings. */
export const SHOWCASE_DECKS: ComposedShowcase[] = SHOWCASES.map((s) => ({
  ...s,
  name: THEMES[s.themeId].name,
  deck: composeDeck(s.plan, resolveSettings({ ...DEFAULT_SETTINGS, themeId: s.themeId })),
}));
