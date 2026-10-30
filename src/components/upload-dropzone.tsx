"use client";

import { useRef, useState } from "react";
import { AlertCircle, FileText, Lock, RefreshCw, UploadCloud, X } from "lucide-react";
import { MAX_FILE_SIZE_MB } from "@/lib/docx/validation";
import { formatFileSize } from "@/lib/utils/file-utils";

interface Props {
  file: File | null;
  error: string | null;
  disabled?: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
  onTrySample: () => void;
  sampleLoading?: boolean;
}

export function UploadDropzone({ file, error, disabled, onFile, onClear, onTrySample, sampleLoading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={(e) => pick(e.target.files)}
        disabled={disabled}
        aria-label="Choose a Word document"
      />

      {file ? (
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <FileText className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900" title={file.name}>
              {file.name}
            </p>
            <p className="text-xs text-slate-500">{formatFileSize(file.size)} · Word document</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Replace</span>
            <span className="sr-only sm:hidden">Replace file</span>
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-disabled={disabled}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !disabled) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) pick(e.dataTransfer.files);
          }}
          className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
            dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50/50 hover:border-brand-500/60 hover:bg-brand-50/40"
          } focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-200 transition group-hover:scale-105">
            <UploadCloud className="h-7 w-7" aria-hidden />
          </span>
          <p className="mt-4 text-sm font-medium text-slate-900">
            Drag and drop your Word document, or <span className="text-brand-600 underline-offset-2 group-hover:underline">browse</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">.docx files up to {MAX_FILE_SIZE_MB} MB</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Processed locally in your browser — nothing is uploaded.
        </span>
        {!file && (
          <button
            type="button"
            onClick={onTrySample}
            disabled={disabled || sampleLoading}
            className="font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            {sampleLoading ? "Loading sample…" : "No document handy? Try a sample"}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        SlideCraft extracts your content and redesigns it as slides; the original Word formatting is not reproduced exactly.
      </p>
    </div>
  );
}
