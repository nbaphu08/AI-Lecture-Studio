# SlideCraft

**Turn Word documents into beautiful, editable PowerPoint presentations, entirely in your browser.**

SlideCraft is a small web app. You upload a `.docx` file, pick a design theme and download a `.pptx`. Each slide uses native PowerPoint text, shapes and tables, so you can keep editing it.

There is no server, no account, no API key and no AI model. The document is read, analyzed and converted on your own computer by a **rule-based** engine.

---

## 1. What it does

1. **Upload** a Word document (`.docx`, up to 15 MB). Drag-and-drop and the file picker both work. A bundled sample document is available for demos.
2. **Choose a design.** There are five themes: Academic, Minimalist, Modern, Corporate and Editorial. You can also set the accent color, background, font, aspect ratio (16:9 or 4:3), content density, slide numbers and section labels.
3. **Optionally describe a style** in plain words, for example *"navy blue, large titles, less text"*. A small keyword mapper turns the phrases it recognizes into settings. It ignores everything else and tells you so.
4. **Generate.** A progress list shows each local stage: reading, analyzing, planning, designing and preparing the PowerPoint.
5. **Preview** the slides in the browser. There's a gallery, keyboard navigation and a larger view.
6. **Download** the `.pptx`.

### Slide layouts

The planner picks from 12 layouts using deterministic rules:

| Layout | Used when |
| --- | --- |
| Cover | Document title (Word *Title* style, or a single leading Heading 1) plus a short subtitle |
| Section divider | Each Heading 1 when the document has 3 or more top-level sections |
| Standard content | Prose paragraphs (short statements become a highlighted callout) |
| Title + bullets | Lists, and paragraphs split at sentence boundaries |
| Two columns | Long lists of short items, or a heading with two small subsections |
| Definition / key concept | A heading followed by one short explanation, or a "**Term**: explanation" line |
| Process | Ordered lists, "Step 1: …" paragraphs, or "First… Then… Finally…" sentences |
| Timeline | 3 or more items that start with a date ("1998: …", "In March 2011, …") |
| Comparison | A "X vs Y" heading with two subsections, or a paragraph with an explicit contrast ("In contrast, …") |
| Table | Real Word tables, paginated with a repeated header row |
| Image + text | Embedded images, paired with the nearby text |
| Key takeaways | Sections titled Conclusion, Summary, Key Takeaways, Recommendations, … |

### Content preservation

SlideCraft converts documents. It does not write content:

- It never invents, summarizes or rewrites text. Long paragraphs are only *divided* at sentence boundaries.
- Every source block is tracked. Each one is either placed on a slide or reported as unsupported. If no layout rule matches a block, a safety net places it on a plain slide.
- The results panel shows how many content blocks were placed, plus any warnings (for example, skipped EMF images).

---

## 2. Technologies

- **Next.js 16** (App Router, static export) with **React 19** and **TypeScript**
- **Tailwind CSS 4** for the interface
- **Mammoth.js** to read `.docx` files in the browser
- **PptxGenJS** to write `.pptx` files in the browser
- **Lucide React** icons
- **Vitest** with jsdom for tests

## 3. How it works

```
DOCX file
  → lib/docx/parser.ts         Mammoth → HTML → DOMParser → typed, sanitized blocks
  → lib/slides/planner.ts      rule-based slide plan + content coverage report
  → lib/pptx/compose.ts        theme + layouts → positioned shapes (inches/points)
        ├─ components/slide-canvas.tsx   HTML/CSS preview of those shapes
        └─ lib/pptx/generate.ts          the same shapes written with PptxGenJS
  → Blob download (.pptx)
```

The preview and the exported file use **the same layout output**, so they match closely. The preview is still an approximation, because fonts and line breaks differ slightly between browsers and office apps.

**Security:** Mammoth's HTML output is never rendered. It's parsed into an inert DOM, and only supported elements and safe text are copied into typed data. Images are kept only as embedded `data:image/...` URIs, and links only if they use `http`, `https` or `mailto`.

### Project structure

```text
src/
  app/                layout.tsx, page.tsx, globals.css, icon.svg
  components/         header, hero-section, upload-dropzone, design-settings,
                      generation-progress, results-panel, slide-preview, slide-canvas
  lib/
    docx/             parser.ts, types.ts, validation.ts
    slides/           planner.ts, content-analysis.ts, types.ts
    design/           themes.ts, tokens.ts, color.ts, text-utils.ts, layout-utils.ts,
                      style-hints.ts, demo-plan.ts
    pptx/             compose.ts, draw.ts, generate.ts
      layouts/        cover, section-divider, content (standard + bullets), definition,
                      two-column, comparison, process, timeline, table, image-text,
                      conclusion, chrome (per-theme title frame), shared
    utils/            errors.ts, file-utils.ts
    pipeline.ts       orchestrates the stages for the UI
    settings.ts       presentation settings type + defaults
  tests/              validation, parser, planner, content-coverage, pptx, style-hints
scripts/
  docx-builder.ts     tiny .docx writer for test fixtures
  sample-content.ts   content of the bundled sample lecture
  build-sample-docx.ts
public/
  sample-renewable-energy.docx
```

---

## 4. Install

You need Node.js 20 or newer.

```bash
npm install
```

## 5. Run locally

```bash
npm run dev
```

Then open http://localhost:3000.

## 6. Tests and checks

```bash
npm test            # unit + integration tests (Vitest)
npm run typecheck   # TypeScript
npm run lint        # ESLint
```

The tests cover these areas:

- File validation
- DOCX parsing: headings, lists, tables, images, links, sanitization, empty and corrupted files
- Every planner rule
- Long-paragraph splitting
- Content coverage: every word of the sample document must appear on some slide, at every density
- PPTX output for every theme and both aspect ratios: valid ZIP and XML, native tables, embedded media, correct slide size, nothing positioned off-slide

## 7. Build for production

```bash
npm run build       # static export into ./out
npm start           # serve ./out locally (uses `npx serve`)
```

To regenerate the bundled sample document, run `npm run sample`.

## 8. Deploy on Vercel (Hobby, free)

1. Push this repository to GitHub.
2. Go to https://vercel.com/new and sign in with GitHub.
3. **Import** the repository. Vercel detects Next.js automatically.
4. Leave the defaults as they are:
   - Build command: `npm run build`
   - Output: detected from `output: "export"`
   - Environment variables: **none needed**
5. Click **Deploy**. You get a `*.vercel.app` URL. Every later push to `main` redeploys automatically.

There's no database, API route, server function or secret to configure. `out/` is plain static files, so any static host also works (Netlify, GitHub Pages, Cloudflare Pages).

---

## 9. Limitations (first version)

- **Rule-based, not AI.** Layouts come from document structure and simple text patterns. Documents with clear Word headings (Heading 1/2/3) give the best results. Unstructured text still converts, but with less layout variety.
- **The style description understands keywords only.** It recognizes about 25 phrases (themes, colors, dark, warm, colorful, large titles, more diagrams, less/more text). Everything else is ignored.
- **Formatting isn't reproduced.** Fonts, colors, page layout and inline bold or italic inside paragraphs are replaced by the chosen theme. Hyperlink text is kept, but the links are not clickable on the slides.
- **Some content can't be used.** EMF/WMF images (common for pasted Office drawings), SmartArt, charts, text boxes, footnotes, comments and equations are skipped or reduced to plain text. Skipped images are reported as warnings.
- **No charts.** Native charts are not created from table data. Tables stay tables.
- **Nested lists are flattened.** Merged table cells are not preserved.
- **Fonts depend on the viewer's machine.** Themes use common system fonts (Calibri, Arial, Georgia, Trebuchet MS…). If one is missing, the preview and PowerPoint substitute a similar font, which can change line breaks a little.
- **Legacy `.doc` files are not supported.** Save them as `.docx` first.
