import { encodePng, type Part } from "./docx-builder.ts";

/** A simple illustrative graphic: sun, hills and a wind turbine silhouette. */
function illustration(): Uint8Array {
  const w = 480;
  const h = 300;
  return encodePng(w, h, (x, y) => {
    const sun = (x - 360) ** 2 + (y - 80) ** 2 < 45 ** 2;
    const hill = y > 220 + 25 * Math.sin(x / 70);
    const tower = Math.abs(x - 150) < 4 && y > 110 && y < 240;
    const angle = Math.atan2(y - 110, x - 150);
    const r = Math.hypot(x - 150, y - 110);
    const blade = r < 70 && [0, (2 * Math.PI) / 3, (-2 * Math.PI) / 3].some((a) => Math.abs(Math.sin(angle - a - 0.3)) * r < 4 && Math.cos(angle - a - 0.3) > 0);
    if (tower || blade) return [245, 245, 245];
    if (sun) return [250, 196, 72];
    if (hill) return [63, 140, 96];
    const t = y / h;
    return [Math.round(70 + 90 * t), Math.round(130 + 80 * t), Math.round(200 + 40 * t)];
  });
}

export function sampleParts(): Part[] {
  return [
    { kind: "title", text: "Introduction to Renewable Energy" },
    { kind: "subtitle", text: "Lecture 3 — Energy Systems and Sustainability" },
    {
      kind: "p",
      text: "This lecture introduces the main renewable energy sources, how they are converted into electricity, and the trade-offs involved in building a cleaner energy system.",
    },
    { kind: "heading", level: 1, text: "Core Concepts" },
    { kind: "heading", level: 2, text: "Renewable Energy" },
    {
      kind: "p",
      text: "Renewable energy is energy that comes from natural sources that are replenished faster than they are consumed, such as sunlight, wind and flowing water.",
    },
    { kind: "heading", level: 2, text: "Why It Matters" },
    {
      kind: "p",
      text: "Energy choices affect the climate, public health and the economy. Burning fossil fuels releases greenhouse gases and air pollutants. Renewable sources produce little or no emissions during operation. They also reduce dependence on imported fuels.",
    },
    { kind: "ul", items: ["Lower lifecycle emissions", "Improved air quality", "Greater energy security", "New local jobs and industries"] },
    { kind: "image", png: illustration(), widthPx: 480, heightPx: 300, alt: "Solar and wind energy in a rural landscape" },
    {
      kind: "p",
      text: "Solar panels and wind turbines are now common sights in many landscapes, often sharing land with agriculture.",
    },
    { kind: "heading", level: 1, text: "Energy Sources" },
    { kind: "heading", level: 2, text: "Solar vs Wind" },
    { kind: "heading", level: 3, text: "Solar Power" },
    { kind: "ul", items: ["Converts sunlight directly into electricity", "Works well on rooftops and in sunny regions", "Produces only during daylight hours"] },
    { kind: "heading", level: 3, text: "Wind Power" },
    { kind: "ul", items: ["Converts moving air into rotational energy", "Strong output in coastal and open areas", "Can generate day and night when wind blows"] },
    { kind: "heading", level: 2, text: "How a Wind Turbine Generates Electricity" },
    {
      kind: "ol",
      items: [
        "Wind pushes against the blades and makes the rotor spin.",
        "The rotor turns a shaft connected to a gearbox.",
        "The gearbox increases the rotation speed.",
        "A generator converts the rotation into electricity.",
        "A transformer adjusts the voltage for the grid.",
      ],
    },
    { kind: "heading", level: 2, text: "Comparing Common Sources" },
    {
      kind: "table",
      header: true,
      rows: [
        ["Source", "Availability", "Main advantage", "Main challenge"],
        ["Solar", "Daytime, weather dependent", "Modular and quiet", "Output varies with clouds and season"],
        ["Wind", "Variable, site dependent", "Low operating cost", "Requires suitable locations"],
        ["Hydropower", "Steady where rivers allow", "Flexible output", "Impacts on river ecosystems"],
        ["Geothermal", "Continuous", "Stable baseload power", "Limited to certain regions"],
      ],
    },
    { kind: "heading", level: 1, text: "History and Outlook" },
    { kind: "heading", level: 2, text: "Milestones" },
    { kind: "p", text: "1839: Edmond Becquerel observes the photovoltaic effect." },
    { kind: "p", text: "1887: James Blyth builds one of the first electricity-generating wind turbines." },
    { kind: "p", text: "1954: Bell Labs demonstrates a practical silicon solar cell." },
    { kind: "p", text: "1991: The first offshore wind farm begins operating in Denmark." },
    { kind: "heading", level: 2, text: "Grid Integration" },
    {
      kind: "p",
      text: "Fossil-fuel plants can be switched on when demand rises. In contrast, solar and wind output depends on the weather, so grids rely on storage, flexible demand and wider transmission networks to balance supply.",
    },
    { kind: "heading", level: 1, text: "Key Takeaways" },
    {
      kind: "ul",
      items: [
        "Renewable sources are replenished naturally and emit little during operation.",
        "Solar and wind are complementary but both are variable.",
        "Storage and smarter grids are essential for high renewable shares.",
        "Every source involves trade-offs in cost, land use and reliability.",
      ],
    },
  ];
}
