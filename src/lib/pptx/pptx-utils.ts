/** Inspection of a finished .pptx package. */

export interface PptxInspection {
  ok: boolean;
  slideCount: number;
  problems: string[];
}

export async function inspectPptx(data: Blob | Uint8Array | ArrayBuffer, expectedSlides: number): Promise<PptxInspection> {
  const problems: string[] = [];
  try {
    const { default: JSZip } = await import("jszip");
    const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
    const zip = await JSZip.loadAsync(bytes);
    const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    if (!zip.file("ppt/presentation.xml")) problems.push("The file has no presentation part.");
    if (slideFiles.length !== expectedSlides) problems.push(`The file contains ${slideFiles.length} slides, but ${expectedSlides} were planned.`);

    if (typeof DOMParser !== "undefined") {
      const parser = new DOMParser();
      for (const f of slideFiles) {
        const xml = await zip.file(f)!.async("string");
        if (parser.parseFromString(xml, "application/xml").getElementsByTagName("parsererror").length) {
          problems.push(`${f} is not well-formed XML.`);
        }
        // Gradient placeholder colors must have been swapped for real gradients.
        if (/val="F1E2D3"/.test(xml)) problems.push(`${f} still contains a gradient placeholder.`);
      }
    }
    return { ok: problems.length === 0, slideCount: slideFiles.length, problems };
  } catch {
    return { ok: false, slideCount: 0, problems: ["The generated file could not be opened as a PowerPoint package."] };
  }
}
