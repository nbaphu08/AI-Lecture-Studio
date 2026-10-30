import { AppError } from "@/lib/utils/errors";

/** Adjust this single constant to change the upload limit. */
export const MAX_FILE_SIZE_MB = 15;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export interface FileLike {
  name: string;
  size: number;
}

/** Returns a user-readable error message, or null if the file is acceptable. */
export function validateDocxFile(file: FileLike, maxBytes = MAX_FILE_SIZE_BYTES): string | null {
  if (!/\.docx$/i.test(file.name)) {
    return /\.doc$/i.test(file.name)
      ? "Legacy .doc files are not supported. Please save the document as .docx in Word and try again."
      : "Only Word documents (.docx) are supported.";
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > maxBytes) {
    return `This file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB. Please choose a smaller document.`;
  }
  return null;
}

/** A .docx is a ZIP archive; check the magic bytes before handing it to the parser. */
export function looksLikeZip(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function assertValidDocx(file: FileLike, buffer: ArrayBuffer): void {
  const message = validateDocxFile(file);
  if (message) throw new AppError(file.size > MAX_FILE_SIZE_BYTES ? "too-large" : "invalid-type", message);
  if (!looksLikeZip(buffer)) {
    throw new AppError("corrupted", "This file could not be read as a Word document. It may be damaged or not a real .docx file.");
  }
}
