export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

/** Turn arbitrary text into a safe, readable file name stem. */
export function toFileStem(text: string, fallback = "presentation"): string {
  const cleaned = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

/** Human-friendly title guess from a file name, e.g. "my_report-v2.docx" → "My report v2". */
export function titleFromFileName(fileName: string): string {
  const stem = baseName(fileName).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!stem) return "Untitled presentation";
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}
