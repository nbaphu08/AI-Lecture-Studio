/** Stages shown in the progress list. Each is reported only while that work is really happening. */
export type Stage = "reading" | "segmenting" | "analyzing" | "consolidating" | "planning" | "generating" | "validating";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "reading", label: "Extracting document" },
  { id: "segmenting", label: "Segmenting sections" },
  { id: "analyzing", label: "Analyzing chunks" },
  { id: "consolidating", label: "Consolidating summaries" },
  { id: "planning", label: "Planning slides" },
  { id: "generating", label: "Generating PPTX" },
  { id: "validating", label: "Validating presentation" },
];
