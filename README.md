# AI Lecture Studio

**Turn a Word lecture document into an editable PowerPoint. Google's Gemini plans the slides; the PowerPoint is built in your browser.**

You upload a `.docx` file, pick a design theme and download a `.pptx`. Gemini reads the document, works out what matters, and decides how many slides to make, in what order, and with which layout. The deck itself is drawn with native PowerPoint text, shapes, tables and charts, so you can keep editing it.

> The earlier version of this project was a fully offline, rule-based converter. That planner is still in the code and is offered as an explicit, opt-in fallback when the AI service is unavailable. See [Basic planner](#basic-offline-planner).

---

## 1. What it does

1. **Upload** a Word document (`.docx`, up to 15 MB). Drag-and-drop and the file picker both work. A bundled sample is available for demos.
2. **Choose a design.** Six themes (Academic, Minimalist, Modern, Corporate, Editorial, Midnight), accent color, background, font, aspect ratio (16:9 or 4:3), content density, slide numbers and section labels. An optional plain-words style description (for example *"navy blue, large titles, less text"*) is mapped by a small keyword parser.
3. **Generate.** The progress list shows what is really happening: reading the document, analyzing content, summarizing sections (only when the document is long), planning slides, generating the PowerPoint, validating the presentation.
4. **Preview** the slides in the browser, then **download** the `.pptx`.

### What the AI decides, and what it does not

| Gemini (server) | The design engine (browser) |
| --- | --- |
| Topic, learning objectives, structure | Maps layouts to the theme you picked |
| Essential knowledge vs. supporting detail vs. repeated information | Applies colors, fonts, aspect ratio |
| Number and order of slides, titles, bullets | Fits text, splits overloaded slides |
| Which layout suits each slide | Copies tables and images from your document |
| Speaker notes | Writes the editable `.pptx` with PptxGenJS |

Gemini never produces the PowerPoint file, never sees images, and never supplies the cells of a table when the source already has them: a slide can *reference* a source table or image by id and the original is used.

### Slide layouts

Title · section divider · title + bullets · prose content · definition · two columns · text + image · comparison · process · timeline · **chart** (native, editable bar/line/pie) · table · key takeaways · **quiz / discussion**. If the AI names a layout the renderer does not know, one is inferred from the content. If a layout cannot hold the content (for example a "process" with one step), a plain content layout is used and you are told.

### Accuracy and traceability

- The prompts forbid adding facts, numbers, dates, quotations or references that are not in the document, and tell the model to ignore instructions that appear inside the document.
- Each slide records the **source sections** it came from. Sections that no slide cites are reported as a warning, so missing material is visible.
- **Charts are only built from numbers found in the document.** Every value is checked against the source text; a chart with an unknown number is dropped, not drawn.
- Numbers that appear in slide text but not in the source produce a "please check" warning.
- Tables and images come from the original document, not from the AI.
- In *concise* mode, low-importance points move to the speaker notes instead of disappearing.

---

## 2. Architecture

```
DOCX (browser)
  → lib/docx/parser.ts            Mammoth → sanitized, typed blocks (images stay in the browser)
  → lib/document/wire.ts          text-only copy of the blocks: the ONLY thing sent to the server
  ──────────────── POST /api/analyze (NDJSON stream: stage events, then the plan) ───────────
  server: app/api/analyze/route.ts → lib/ai/route-handler.ts
          validates the request, limits abuse, reads GEMINI_API_KEY
  → lib/document/sections.ts      sections with stable ids (section-001 …)
  → lib/document/chunker.ts       sections packed into chunks (long documents only)
  → lib/ai/document-analyzer.ts   per-chunk analysis → digests         (long documents)
  → lib/ai/slide-planner.ts       ONE structured slide-plan request
  → lib/ai/plan-validation.ts     JSON → Zod → grounding checks → one repair attempt
  → lib/ai/gemini-client.ts       @google/genai, retries, timeouts, error mapping
  ──────────────────────────────────────────────────────────────────────────────────────────
  → lib/analyze-client.ts         reads the stream, re-validates the plan with Zod
  → lib/slides/ai-plan.ts         design engine: layout mapping, fallbacks, splitting, source blocks
  → lib/pptx/compose.ts           theme + layouts → positioned shapes
        ├─ components/slide-canvas.tsx   HTML preview of those shapes
        └─ lib/pptx/generate.ts          the same shapes written with PptxGenJS (+ notes, charts)
  → lib/pptx/slide-validator.ts   overflow / bounds / overlap / empty / density checks, auto-split
  → lib/pptx/pptx-utils.ts        opens the finished package and checks it
  → Blob download (.pptx)
```

**Why the DOCX is parsed in the browser.** Parsing there keeps the existing, tested parser and keeps images local. Only extracted text and structure are sent, which also keeps requests far below Vercel's 4.5 MB request limit.

**Short vs. long documents.** Up to `AI_SINGLE_CALL_CHARS` (45,000 characters by default) the whole document goes into a single request that both analyzes and plans. Longer documents are cut into chunks along their sections, never mid-sentence, each chunk is analyzed on its own and the digests are consolidated into one plan so repeated information is merged. Chunks run sequentially by default (`AI_CONCURRENCY=1`) to respect free-tier rate limits.

**Structured output.** Gemini is called with `responseMimeType: "application/json"` and a JSON schema. The answer is then parsed with Zod, which does not trust the model: invalid JSON or an invalid structure triggers exactly one repair request that lists the problems; if the result is still invalid the user sees an error and no deck is made. Unknown layout names, unknown section ids and duplicate slide ids are corrected or removed locally and reported.

### Project structure

```text
src/
  app/
    api/analyze/route.ts         the only server endpoint (Node.js runtime, 300 s max)
    studio/page.tsx, page.tsx    pages (landing + studio, unchanged design)
  components/                    UI (unchanged apart from a few text strings and the progress list)
  lib/
    ai/                          config, gemini-client, prompts, schemas, document-analyzer,
                                 slide-planner, plan-validation, analyze-service, route-handler,
                                 rate-limit, protocol
    document/                    wire (request schema), sections, chunker
    docx/                        parser, types, validation          (existing)
    slides/                      ai-plan (design engine), split, planner (basic planner), types
    design/                      themes, tokens, color, text-utils…  (existing)
    pptx/                        compose, draw, generate, slide-validator, pptx-utils
      layouts/                   existing layouts + chart + quiz
    analyze-client.ts            browser side of /api/analyze
    pipeline.ts                  orchestrates the stages for the UI
  tests/                         see "Tests"
```

---

## 3. Local setup

You need Node.js 20 or newer (the project is developed on Node 26).

```bash
npm install
cp .env.example .env.local     # then edit .env.local
npm run dev                    # http://localhost:3000
```

### Get a Gemini API key (free)

1. Open **Google AI Studio**: https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** and copy it.
3. Put it in `.env.local`:

   ```bash
   GEMINI_API_KEY=your_gemini_api_key
   GEMINI_MODEL=your_supported_flash_model
   ```

4. Restart `npm run dev`.

`GEMINI_MODEL` selects the model. If it is unset, the app uses `gemini-3.8-flash`, which Google's models and pricing pages list as a Flash model with a free-of-charge Free Tier (checked 2026-11-06). Google changes this from time to time and quotas are per project, so confirm it for **your** key with the diagnostics below. If the model is not available to your key, the app shows "The configured AI model is not available" and you change `GEMINI_MODEL`; no code changes are needed.

### Verify the Gemini connection (diagnostics)

With `npm run dev` running, in another terminal:

```bash
npm run check:gemini                # key present? model exists for this key? (no generation, no quota used)
npm run check:gemini -- --generate  # + one tiny structured-output request
npm run check:gemini -- --full      # + the app's real plan and analysis schemas on a built-in sample (about 3 requests)
```

The report lists each check as PASS / WARN / FAIL / SKIP and says whether Gemini actually answered during the run. It never prints the key, Google's free-text error messages or any document content; only a built-in sample text is ever sent. On a deployed site the endpoint `/api/diagnostics?mode=models|generate|full` is **disabled (404)** unless you set `DIAGNOSTICS_TOKEN` and send it as `Authorization: Bearer <token>`; use `npm run check:gemini -- --url https://your-site --full` with `DIAGNOSTICS_TOKEN` in your shell.

### API notes

- The app uses the SDK's `models.generateContent` with `responseMimeType: "application/json"` and `responseJsonSchema`. Google now labels GenerateContent as a *legacy* API in favor of the Interactions API, but states it "remains fully supported" and gives no sunset date. Moving to the Interactions API later only touches `src/lib/ai/gemini-client.ts`.
- `temperature` is not sent: Gemini 3.6 Flash and newer ignore it. Thinking is left at the model's default.
- The SDK's own retry option is not enabled, so retries happen only once, in the app (`AI_MAX_RETRIES`).

The key is read only on the server. Never rename it with a `NEXT_PUBLIC_` prefix, never commit `.env.local` (it is git-ignored), and never paste a real key into documentation or issues.

### All settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` | – | Required. Server-side only. `GOOGLE_API_KEY` is accepted as a fallback name. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Model id. |
| `AI_MAX_DOC_CHARS` | 300000 | Longest document text accepted. |
| `AI_SINGLE_CALL_CHARS` | 45000 | Up to this size the document is planned in one request. |
| `AI_CHUNK_CHARS` | 24000 | Chunk size for longer documents. |
| `AI_MAX_OUTPUT_TOKENS` | 32768 | Max tokens in one answer, including thinking. Must not exceed the model's output limit (65,536 for `gemini-3.8-flash` per Google's model page). |
| `DIAGNOSTICS_TOKEN` | – | Enables `/api/diagnostics` in production. |
| `AI_CONCURRENCY` | 1 | Simultaneous Gemini requests (1–4). Keep 1 on the free tier. |
| `AI_MAX_RETRIES` | 3 | Retries for temporary errors (rate limit, 5xx, network), with exponential backoff and jitter. |
| `AI_REQUEST_TIMEOUT_MS` | 90000 | Timeout of one Gemini request. |
| `AI_TOTAL_TIMEOUT_MS` | 270000 | Deadline for one whole analysis. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | 8 / 600000 | Best-effort per-IP limit. |
| `MAX_IN_FLIGHT` | 3 | Best-effort cap of simultaneous analyses per server instance. |

## 4. Tests and checks

```bash
npm test            # Vitest
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm run build       # production build
```

The Gemini tests use a **deterministic fake Gemini** (`src/tests/fake-gemini.ts`) and never call the real API, so they check the application's plumbing (chunking, validation, repair, retries, error mapping, layout mapping, PPTX output) and not the quality of Gemini's summaries. Quality can only be judged with a real key: try your own documents.

Covered areas: DOCX extraction (existing), sections and chunking (including very long paragraphs and tables), Zod validation of AI output, invalid-output repair, Gemini error classification, retry and backoff limits, request validation and abuse limits, the HTTP handler (no key leakage), the browser ↔ server loop, layout mapping and fallbacks, density-based splitting, source-table/image fidelity, chart grounding, PPTX generation for every theme and both aspect ratios (native charts, notes, tables), layout validation and repair, and six scenario documents (short lecture, long multi-chapter lecture, tables, numeric data, long technical text, repeated information).

## 5. Deploy on Vercel

The project is a normal Next.js app (no static export), so `/api/analyze` runs as a Vercel Function on the Node.js runtime with `maxDuration = 300`.

1. Push the repository to GitHub and **Import** it at https://vercel.com/new (Next.js is detected automatically).
2. In **Project → Settings → Environment Variables**, add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL` and the tuning variables) for Production and Preview. Mark the key as *Sensitive*.
3. **Deploy.** Environment variables are read when a deployment is built or started, so redeploy after changing them.

From the CLI: `vercel env add GEMINI_API_KEY` and `vercel --prod`.

No database, no authentication and no file storage are used. Uploaded documents are never saved: the `.docx` never leaves the browser, and the extracted text lives only in the request's memory while Gemini is called.

## 6. Free tier: what to expect

- The free tier has **per-minute and per-day request and token limits that Google can change**. Do not assume it is unlimited or permanent.
- A one-request document costs one Gemini request. A long document costs one request per chunk plus one planning request (plus at most one repair request each). Requests run one at a time by default.
- Temporary rate-limit responses are retried with exponential backoff (at most `AI_MAX_RETRIES`, never forever). If Google asks for a very long wait, the app stops instead of hanging.
- When the daily quota is exhausted, users see: *"The AI service has reached its current usage limit… Please try again later."* The app never switches to a paid model on its own.
- Free-tier prompts and responses may be used by Google to improve its products according to Google's current terms. Check them before using confidential documents.
- "Generate Again" with only a different theme or color does **not** call the AI again: the received plan is reused. Changing the density or the style description does.

## 7. Security

- The API key lives in server environment variables and is never sent to the browser, put in a `NEXT_PUBLIC_` variable, returned in a response, logged, or written into a PPTX. Errors sent to the browser contain only a code and a fixed, user-safe message; stack traces and Google's raw error text stay on the server.
- The browser talks only to `/api/analyze`, never to Google. The endpoint accepts a fixed JSON shape (Zod-validated, with size limits on every field); it fetches no URLs and accepts no files.
- Document text is passed to the model as quoted data with an instruction to ignore instructions inside it. Because a model can still be influenced by hostile text, everything it returns is validated and rendered only as plain PowerPoint text: no HTML is ever generated from document or AI content.
- Mammoth's HTML is never rendered (existing behavior); it is parsed into an inert DOM and reduced to typed blocks.
- Security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`) are set in `next.config.mjs`.

### Known limitation: abuse protection

There is no authentication, so anyone with the URL can use your Gemini quota. The app limits requests per IP and simultaneous analyses, but **these counters live in the memory of a single server instance**. Vercel runs many short-lived instances, so this only slows down casual repeated use; it is **not a global or reliable limit** and is not a security boundary. If the site is public, add real protection: Vercel's WAF rate limiting (see the Firewall settings), a shared store such as Upstash Redis for counters, or a password/invite gate. Also set a spending cap or keep the key on the free tier.

## 8. Basic offline planner

The previous rule-based planner (`src/lib/slides/planner.ts`) is unchanged. It is **never** used silently. When the AI service fails in a way that makes it unavailable (quota, rate limit, network, timeout, missing/invalid key, invalid response), the error box offers **"Create with the basic offline planner instead"**. The result is labelled as such in the warnings.

## 9. Known limitations

- **Output quality depends on the model.** The checks catch structure problems, unknown sources and unfamiliar numbers, but they cannot prove that every sentence is faithful. Read the deck before presenting it; check any slide with a warning.
- **Number checks are textual.** A chart is accepted only if each value appears as a number in the source (so "45%" can back a value of 45, but a computed total cannot). Charts built from derived numbers are dropped.
- **The model sees text only.** Images are placed from the source and described by their alt text, if any. EMF/WMF images, SmartArt, text boxes, footnotes, comments and equations are skipped or reduced to text, as before.
- **Layout validation uses text-size estimates**, not a rendering engine. It catches overflow, off-slide shapes, overlapping text, empty slides and dense slides, and splits slides rather than shrinking text below 11 pt, but it cannot guarantee pixel-exact results in every PowerPoint version or with missing fonts. A rendering-based check (for example LibreOffice) is not included.
- **The chart preview is an approximation** of the native PowerPoint chart in the exported file.
- **Very long documents** (above `AI_MAX_DOC_CHARS`) are rejected rather than truncated.
- **Formatting is not reproduced.** Fonts, colors and inline formatting are replaced by the chosen theme.
- **Legacy `.doc` files are not supported.** Save them as `.docx`.
- **Live Gemini behavior is only as verified as you verify it.** The automated tests use a fake Gemini. Run `npm run check:gemini -- --full` with your own key to confirm that the model, structured output and the app's schemas work for your account.
