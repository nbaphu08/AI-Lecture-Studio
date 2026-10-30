"use client";

import { useMemo } from "react";
import { Check, Sparkles } from "lucide-react";
import { DEMO_PLAN } from "@/lib/design/demo-plan";
import { parseStyleHint, resolveSettings } from "@/lib/design/style-hints";
import { FONT_OPTIONS, THEME_LIST, type FontKey } from "@/lib/design/themes";
import { normalizeHex } from "@/lib/design/color";
import { composeDeck } from "@/lib/pptx/compose";
import type { PresentationSettings } from "@/lib/settings";
import type { Density } from "@/lib/slides/types";
import { SlideCanvas } from "./slide-canvas";

interface Props {
  settings: PresentationSettings;
  onChange: (patch: Partial<PresentationSettings>) => void;
  disabled?: boolean;
}

const ACCENTS = [
  { label: "Navy", value: "1E3A5F" },
  { label: "Blue", value: "2563EB" },
  { label: "Teal", value: "0F766E" },
  { label: "Green", value: "15803D" },
  { label: "Purple", value: "6D28D9" },
  { label: "Crimson", value: "B91C1C" },
  { label: "Orange", value: "C2410C" },
];

const BACKGROUNDS = [
  { label: "White", value: "FFFFFF" },
  { label: "Warm white", value: "FBF8F3" },
  { label: "Light gray", value: "F3F4F6" },
  { label: "Slate", value: "1E293B" },
  { label: "Charcoal", value: "111827" },
];

const DENSITIES: { id: Density; label: string; hint: string }[] = [
  { id: "concise", label: "Concise", hint: "Short points, more slides" },
  { id: "balanced", label: "Balanced", hint: "Recommended" },
  { id: "detailed", label: "Detailed", hint: "Keeps more prose per slide" },
];

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">
      {children}
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { id: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-well p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          title={o.hint}
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === o.id ? "bg-brand-600 text-on-gold shadow-sm" : "text-fg-soft hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Swatches({
  value,
  options,
  onChange,
  disabled,
  name,
}: {
  value: string | null;
  options: { label: string; value: string }[];
  onChange: (v: string | null) => void;
  disabled?: boolean;
  name: string;
}) {
  const custom = value && !options.some((o) => o.value === value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        disabled={disabled}
        aria-pressed={value === null}
        className={`h-8 rounded-full border px-3 text-xs font-medium transition ${
          value === null ? "border-brand-600 bg-brand-50 text-brand-700" : "border-edge-strong bg-well text-fg-soft hover:border-brand-500/60"
        }`}
      >
        Theme
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.label}
          aria-label={`${name}: ${o.label}`}
          aria-pressed={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
            value === o.value ? "border-brand-600 ring-2 ring-brand-500/30" : "border-edge-strong hover:scale-105"
          }`}
          style={{ background: `#${o.value}` }}
        >
          {value === o.value && <Check className={`h-4 w-4 ${["FFFFFF", "FBF8F3", "F3F4F6"].includes(o.value) ? "text-[#1e293b]" : "text-white"}`} />}
        </button>
      ))}
      <label
        className={`relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition ${
          custom ? "border-brand-600 ring-2 ring-brand-500/30" : "border-edge-strong"
        }`}
        title={`Custom ${name.toLowerCase()}`}
        style={{ background: custom ? `#${value}` : "conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)" }}
      >
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={`Custom ${name.toLowerCase()}`}
          disabled={disabled}
          value={`#${value ?? "4752E0"}`}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
        />
      </label>
    </div>
  );
}

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-edge bg-well px-3 py-2.5">
      <span className="text-sm text-fg-soft">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-brand-600" : "bg-edge-strong"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full shadow transition-all ${checked ? "left-[18px] bg-on-gold" : "left-0.5 bg-white"}`} />
      </button>
    </label>
  );
}

export function DesignSettings({ settings, onChange, disabled }: Props) {
  // Render real thumbnails with the actual layout engine so they match the exported slides.
  const thumbnails = useMemo(
    () =>
      THEME_LIST.map((t) => {
        const effective = resolveSettings({ ...settings, themeId: t.id, styleHint: "" });
        return { theme: t, deck: composeDeck(DEMO_PLAN, effective) };
      }),
    // Only the visual settings affect thumbnails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.accent, settings.background, settings.font, settings.aspect, settings.showSlideNumbers, settings.showSectionLabels],
  );
  const hint = useMemo(() => parseStyleHint(settings.styleHint), [settings.styleHint]);

  return (
    <div className="space-y-7">
      <div>
        <Label>Design theme</Label>
        <div role="radiogroup" aria-label="Design theme" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {thumbnails.map(({ theme, deck }) => {
            const active = settings.themeId === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onChange({ themeId: theme.id })}
                className={`group rounded-xl border p-1.5 text-left transition ${
                  active ? "border-brand-600 bg-brand-50/50 ring-2 ring-brand-500/25" : "border-edge bg-well hover:border-edge-strong"
                }`}
              >
                <div className="overflow-hidden rounded-lg ring-1 ring-white/15">
                  <SlideCanvas slide={deck.slides[0]} width={deck.w} height={deck.h} />
                </div>
                <div className="flex items-center justify-between px-1.5 pb-1 pt-2">
                  <span className="text-sm font-medium text-fg">{theme.name}</span>
                  {active && <Check className="h-4 w-4 text-brand-600" aria-hidden />}
                </div>
                <div className="px-1.5 pb-1.5">
                  <p className="line-clamp-2 text-xs text-fg-muted">{theme.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label>Accent color</Label>
          <Swatches name="Accent color" value={settings.accent} options={ACCENTS} onChange={(accent) => onChange({ accent })} disabled={disabled} />
        </div>
        <div>
          <Label>Background</Label>
          <Swatches
            name="Background"
            value={settings.background}
            options={BACKGROUNDS}
            onChange={(background) => onChange({ background })}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="font">Font</Label>
          <select
            id="font"
            value={settings.font}
            disabled={disabled}
            onChange={(e) => onChange({ font: e.target.value as FontKey })}
            className="h-10 w-full rounded-xl border border-edge-strong bg-well px-3 text-sm text-fg focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Aspect ratio</Label>
          <Segmented
            label="Aspect ratio"
            value={settings.aspect}
            options={[
              { id: "16:9", label: "16:9 Wide" },
              { id: "4:3", label: "4:3 Standard" },
            ]}
            onChange={(aspect) => onChange({ aspect })}
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <Label>Content density</Label>
        <Segmented label="Content density" value={settings.density} options={DENSITIES} onChange={(density) => onChange({ density })} disabled={disabled} />
        <p className="mt-2 text-xs text-fg-muted">{DENSITIES.find((d) => d.id === settings.density)?.hint}. Your text is never rewritten, only divided across slides.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Toggle label="Slide numbers" checked={settings.showSlideNumbers} onChange={(v) => onChange({ showSlideNumbers: v })} disabled={disabled} />
        <Toggle label="Section labels" checked={settings.showSectionLabels} onChange={(v) => onChange({ showSectionLabels: v })} disabled={disabled} />
      </div>

      <div>
        <Label htmlFor="style-hint">Style description (optional)</Label>
        <textarea
          id="style-hint"
          rows={2}
          maxLength={300}
          disabled={disabled}
          value={settings.styleHint}
          onChange={(e) => onChange({ styleHint: e.target.value })}
          placeholder="Describe your preferred presentation style… e.g. navy blue, large titles, clean academic style, less text"
          className="w-full resize-none rounded-xl border border-edge-strong bg-well px-3 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {hint.recognized.length > 0 ? (
            <>
              <Sparkles className="h-3.5 w-3.5 text-brand-600" aria-hidden />
              <span className="text-fg-muted">Applied:</span>
              {hint.recognized.map((r) => (
                <span key={r} className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
                  {r}
                </span>
              ))}
            </>
          ) : (
            <span className="text-fg-muted">
              Recognizes keywords like academic, minimalist, corporate, dark, navy, green, warm, colorful, large titles, more diagrams, less text.
            </span>
          )}
          {hint.hasUnsupported && settings.styleHint.trim() && (
            <span className="w-full pt-1 text-amber-300">
              Some words weren’t recognized and will be ignored — the selected settings are used instead.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
