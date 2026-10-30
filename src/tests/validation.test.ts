import { describe, expect, it } from "vitest";
import { MAX_FILE_SIZE_BYTES, looksLikeZip, validateDocxFile } from "@/lib/docx/validation";

describe("validateDocxFile", () => {
  it("accepts a normal .docx", () => {
    expect(validateDocxFile({ name: "Lecture Notes.DOCX", size: 120_000 })).toBeNull();
  });

  it("rejects other file types", () => {
    expect(validateDocxFile({ name: "notes.pdf", size: 1000 })).toMatch(/only word documents/i);
    expect(validateDocxFile({ name: "notes.docx.exe", size: 1000 })).toMatch(/only word documents/i);
  });

  it("explains legacy .doc files", () => {
    expect(validateDocxFile({ name: "old.doc", size: 1000 })).toMatch(/legacy \.doc/i);
  });

  it("rejects empty and oversized files", () => {
    expect(validateDocxFile({ name: "a.docx", size: 0 })).toMatch(/empty/i);
    expect(validateDocxFile({ name: "a.docx", size: MAX_FILE_SIZE_BYTES + 1 })).toMatch(/larger than 15 MB/);
    expect(validateDocxFile({ name: "a.docx", size: MAX_FILE_SIZE_BYTES })).toBeNull();
  });

  it("detects ZIP signatures", () => {
    expect(looksLikeZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]).buffer)).toBe(true);
    expect(looksLikeZip(new TextEncoder().encode("hello world").buffer as ArrayBuffer)).toBe(false);
  });
});
