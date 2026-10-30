import { buildDocx, type Part } from "../../scripts/docx-builder.ts";
import { parseDocx } from "@/lib/docx/parser";

export async function docxBuffer(parts: Part[]): Promise<ArrayBuffer> {
  const bytes = await buildDocx(parts);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function parseParts(parts: Part[]) {
  return parseDocx(await docxBuffer(parts), "test.docx");
}

/** Lower-case words of 3+ letters, for checking that no source text went missing. */
export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !["in", "the"].includes(w));
}
