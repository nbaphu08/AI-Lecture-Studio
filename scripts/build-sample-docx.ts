// Generates public/sample-renewable-energy.docx. Run: node scripts/build-sample-docx.ts
import { writeFileSync } from "node:fs";
import { buildDocx } from "./docx-builder.ts";
import { sampleParts } from "./sample-content.ts";

const bytes = await buildDocx(sampleParts());
writeFileSync(new URL("../public/sample-renewable-energy.docx", import.meta.url), bytes);
console.log(`Wrote sample document (${bytes.length} bytes)`);
