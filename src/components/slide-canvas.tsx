"use client";

import { memo, useId } from "react";
import { NATURAL_LINE_HEIGHT } from "@/lib/design/text-utils";
import type { ComposedSlide, Gradient, Shadow, Shape } from "@/lib/pptx/draw";

/** CSS fallbacks for fonts that may not be installed on the viewer's machine. */
const FONT_STACKS: Record<string, string> = {
  Calibri: 'Calibri, Carlito, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  Arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  Cambria: 'Cambria, Caladea, Georgia, serif',
  "Trebuchet MS": '"Trebuchet MS", "Segoe UI", "Helvetica Neue", sans-serif',
  Verdana: "Verdana, Geneva, sans-serif",
  "Times New Roman": '"Times New Roman", Times, serif',
};

function gradientVector(angle: number) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

function dropShadow(sh: Shadow, slideW: number): string {
  const rad = ((sh.angle ?? 90) * Math.PI) / 180;
  const u = (pts: number) => `${(pts / 72 / slideW) * 100}cqw`;
  return `drop-shadow(${u(Math.cos(rad) * sh.offset)} ${u(Math.sin(rad) * sh.offset)} ${u(sh.blur / 2)} ${rgba(sh.color ?? "000000", 1 - sh.opacity)})`;
}

function rgba(hex: string, alpha = 0): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return alpha ? `rgba(${r}, ${g}, ${b}, ${1 - alpha})` : `#${hex}`;
}

/** PowerPoint angles (0 = left→right, 90 = top→bottom) → CSS (0 = bottom→top, 90 = left→right). */
function cssGradient(g: Gradient): string {
  return `linear-gradient(${g.angle + 90}deg, #${g.from}, #${g.to})`;
}

/** Simple SVG stand-in for a native PowerPoint chart (the exported file contains the real chart). */
function ChartPreview({ shape: c, left, top, wPct, hPct }: { shape: Extract<Shape, { t: "chart" }>; left: string; top: string; wPct: string; hPct: string }) {
  const W = c.w;
  const H = c.h;
  const fs = c.size / 72;
  const font = FONT_STACKS[c.font] ?? c.font;
  const legend = c.chartType === "pie" || c.series.length > 1;
  const legendH = legend ? fs * 2.2 : 0;
  const left0 = fs * 3.2;
  const bottom = fs * 2.2 + legendH;
  const plot = { x: left0, y: fs * 0.8, w: W - left0 - fs, h: H - fs * 0.8 - bottom };
  const col = (i: number) => `#${c.colors[i % c.colors.length]}`;
  const wrap = (children: React.ReactNode) => (
    <svg className="pointer-events-none absolute" style={{ left, top, width: wPct, height: hPct }} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={c.alt}>
      <g fontFamily={font} fontSize={fs} fill={`#${c.textColor}`}>{children}</g>
    </svg>
  );
  const legendItems = (items: string[]) => {
    let x = 0;
    const widths = items.map((t) => t.length * fs * 0.55 + fs * 2);
    const total = widths.reduce((a, b) => a + b, 0);
    x = (W - total) / 2;
    return items.map((t, i) => {
      const gx = x;
      x += widths[i];
      return (
        <g key={i} transform={`translate(${Math.max(0, gx)}, ${H - fs * 1.1})`}>
          <rect width={fs * 0.8} height={fs * 0.8} y={-fs * 0.7} fill={col(i)} />
          <text x={fs * 1.1}>{t}</text>
        </g>
      );
    });
  };

  if (c.chartType === "pie") {
    const values = c.series[0].values.map((v) => Math.max(0, v));
    const sum = values.reduce((a, b) => a + b, 0) || 1;
    const r = Math.min(plot.w, plot.h + fs * 0.8) / 2;
    const cx = W / 2;
    const cy = fs * 0.8 + r;
    const starts = values.map((_, i) => -Math.PI / 2 + (values.slice(0, i).reduce((a, b) => a + b, 0) / sum) * Math.PI * 2);
    return wrap(
      <>
        {values.map((v, i) => {
          const a0 = starts[i];
          const a1 = a0 + (v / sum) * Math.PI * 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`;
          const mid = (a0 + a1) / 2;
          return (
            <g key={i}>
              <path d={d} fill={col(i)} stroke="#fff" strokeWidth={fs * 0.08} />
              {v / sum > 0.05 && (
                <text x={cx + r * 0.62 * Math.cos(mid)} y={cy + r * 0.62 * Math.sin(mid)} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontWeight={700}>
                  {Math.round((v / sum) * 100)}%
                </text>
              )}
            </g>
          );
        })}
        {legendItems(c.categories)}
      </>,
    );
  }

  const all = c.series.flatMap((s) => s.values);
  const rawMax = Math.max(0, ...all);
  const rawMin = Math.min(0, ...all);
  // "Nice" axis: round step (1, 2, 5 × 10^n) so ticks read 0, 50, 100 rather than 52.5.
  const rough = (rawMax - rawMin || 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = (([1, 2, 5, 10].find((m) => m * pow >= rough) ?? 10) * pow) || 1;
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  const span = max - min || 1;
  const y = (v: number) => plot.y + plot.h - ((v - min) / span) * plot.h;
  const n = c.categories.length;
  const band = plot.w / n;
  const ticks = Math.max(1, Math.round(span / step));
  return wrap(
    <>
      {Array.from({ length: ticks + 1 }, (_, t) => {
        const v = min + step * t;
        return (
          <g key={t}>
            <line x1={plot.x} x2={plot.x + plot.w} y1={y(v)} y2={y(v)} stroke={`#${c.gridColor}`} strokeWidth={0.01} />
            <text x={plot.x - fs * 0.4} y={y(v)} textAnchor="end" dominantBaseline="middle">{Number.isInteger(v) ? v : Number(v.toFixed(2))}</text>
          </g>
        );
      })}
      {c.chartType === "bar"
        ? c.series.map((s, si) =>
            s.values.map((v, ci) => {
              const bw = (band * 0.7) / c.series.length;
              const x = plot.x + ci * band + band * 0.15 + si * bw;
              return <rect key={`${si}-${ci}`} x={x} y={Math.min(y(v), y(0))} width={bw} height={Math.abs(y(v) - y(0))} fill={col(si)} />;
            }),
          )
        : c.series.map((s, si) => (
            <g key={si}>
              <polyline fill="none" stroke={col(si)} strokeWidth={0.05} points={s.values.map((v, ci) => `${plot.x + ci * band + band / 2},${y(v)}`).join(" ")} />
              {s.values.map((v, ci) => <circle key={ci} cx={plot.x + ci * band + band / 2} cy={y(v)} r={0.055} fill={col(si)} />)}
            </g>
          ))}
      {c.categories.map((t, ci) => (
        <text key={ci} x={plot.x + ci * band + band / 2} y={plot.y + plot.h + fs * 1.3} textAnchor="middle">
          {t.length > Math.max(6, band / (fs * 0.55)) ? `${t.slice(0, Math.max(5, Math.floor(band / (fs * 0.55)) - 1))}…` : t}
        </text>
      ))}
      {legend && legendItems(c.series.map((s) => s.name))}
    </>,
  );
}

interface Props {
  slide: ComposedSlide;
  width: number;
  height: number;
  className?: string;
}

/**
 * Approximate HTML rendering of a composed slide. Positions are percentages of the slide and font
 * sizes use container query units, so the same markup works for thumbnails and large previews.
 */
function SlideCanvasInner({ slide, width, height, className }: Props) {
  const uid = useId().replace(/:/g, "");
  const cq = (inches: number) => `${(inches / width) * 100}cqw`;
  const pt = (points: number) => cq(points / 72);
  const boxShadow = (sh: Shadow) => {
    const rad = ((sh.angle ?? 90) * Math.PI) / 180;
    return `${cq((Math.cos(rad) * sh.offset) / 72)} ${cq((Math.sin(rad) * sh.offset) / 72)} ${pt(sh.blur)} ${rgba(sh.color ?? "000000", 1 - sh.opacity)}`;
  };
  const box = (s: { x: number; y: number; w: number; h: number }) => ({
    left: `${(s.x / width) * 100}%`,
    top: `${(s.y / height) * 100}%`,
    width: `${(s.w / width) * 100}%`,
    height: `${(s.h / height) * 100}%`,
  });

  const render = (s: Shape, i: number) => {
    switch (s.t) {
      case "rect":
      case "ellipse":
        return (
          <div
            key={i}
            className={`absolute ${s.t === "ellipse" ? "rounded-full" : ""}`}
            style={{
              ...box(s),
              background: s.gradient ? cssGradient(s.gradient) : s.fill ? rgba(s.fill, s.alpha) : undefined,
              border: s.line ? `${pt(s.line.width)} ${s.line.dash ? "dashed" : "solid"} ${rgba(s.line.color, s.line.alpha)}` : undefined,
              borderRadius: s.t === "rect" && s.radius ? cq(Math.min(s.radius, s.h / 2, s.w / 2)) : undefined,
              boxShadow: s.shadow ? boxShadow(s.shadow) : undefined,
              boxSizing: "border-box",
            }}
          />
        );
      case "poly": {
        const xs = s.points.map((p) => p[0]);
        const ys = s.points.map((p) => p[1]);
        const bx = Math.min(...xs);
        const by = Math.min(...ys);
        const bw = Math.max(...xs) - bx;
        const bh = Math.max(...ys) - by;
        const gid = `grad-${uid}-${i}`;
        return (
          <svg
            key={i}
            className="pointer-events-none absolute overflow-visible"
            style={box({ x: bx, y: by, w: bw, h: bh })}
            viewBox={`${bx} ${by} ${bw} ${bh}`}
            preserveAspectRatio="none"
          >
            {s.gradient && (
              <defs>
                <linearGradient id={gid} gradientUnits="objectBoundingBox" {...gradientVector(s.gradient.angle)}>
                  <stop offset="0" stopColor={`#${s.gradient.from}`} />
                  <stop offset="1" stopColor={`#${s.gradient.to}`} />
                </linearGradient>
              </defs>
            )}
            <polygon
              points={s.points.map((p) => p.join(",")).join(" ")}
              fill={s.gradient ? `url(#${gid})` : s.fill ? `#${s.fill}` : "none"}
              fillOpacity={s.alpha ? 1 - s.alpha : undefined}
              stroke={s.line ? `#${s.line.color}` : "none"}
              strokeWidth={s.line ? s.line.width / 72 : undefined}
              style={s.shadow ? { filter: dropShadow(s.shadow, width) } : undefined}
            />
          </svg>
        );
      }
      case "line": {
        const marker = `arrow-${uid}-${i}`;
        return (
          <svg key={i} className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            {s.arrow && (
              <defs>
                <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill={`#${s.color}`} />
                </marker>
              </defs>
            )}
            <line
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={`#${s.color}`}
              strokeWidth={s.width / 72}
              strokeDasharray={s.dash ? (s.dash === "dot" ? "0.02 0.06" : "0.1 0.06") : undefined}
              markerEnd={s.arrow ? `url(#${marker})` : undefined}
            />
          </svg>
        );
      }
      case "text": {
        let n = 0;
        return (
          <div
            key={i}
            className="shape-text absolute flex flex-col"
            style={{
              ...box(s),
              justifyContent: s.valign === "middle" ? "center" : s.valign === "bottom" ? "flex-end" : "flex-start",
              textAlign: s.align ?? "left",
              color: rgba(s.color, s.alpha),
              fontFamily: FONT_STACKS[s.font] ?? s.font,
              fontSize: pt(s.size),
              fontWeight: s.bold ? 700 : 400,
              fontStyle: s.italic ? "italic" : undefined,
              lineHeight: NATURAL_LINE_HEIGHT * (s.lineSpacing ?? 1),
              letterSpacing: s.charSpacing ? pt(s.charSpacing) : undefined,
              textTransform: s.uppercase ? "uppercase" : undefined,
              overflowWrap: "break-word",
            }}
          >
            {s.paras.map((p, j) => {
              n = p.bullet === "number" ? n + 1 : 0;
              const size = p.size ?? s.size;
              return (
                <p
                  key={j}
                  style={{
                    position: "relative",
                    paddingLeft: p.bullet ? pt(p.bullet === "number" ? 22 : 18) : undefined,
                    marginBottom: p.spaceAfter && j < s.paras.length - 1 ? pt(p.spaceAfter) : undefined,
                    fontWeight: p.bold === undefined ? undefined : p.bold ? 700 : 400,
                    fontStyle: p.italic ? "italic" : undefined,
                    color: p.color ? rgba(p.color, s.alpha) : undefined,
                    fontSize: p.size ? pt(size) : undefined,
                  }}
                >
                  {p.bullet && <span style={{ position: "absolute", left: 0 }}>{p.bullet === "number" ? `${n}.` : "•"}</span>}
                  {p.text}
                </p>
              );
            })}
          </div>
        );
      }
      case "chart":
        return <ChartPreview key={i} shape={s} left={`${(s.x / width) * 100}%`} top={`${(s.y / height) * 100}%`} wPct={`${(s.w / width) * 100}%`} hPct={`${(s.h / height) * 100}%`} />;
      case "image":
        return (
          // eslint-disable-next-line @next/next/no-img-element -- local data URI from the user's document
          <img
            key={i}
            src={s.src}
            alt={s.alt ?? ""}
            className="absolute object-contain"
            style={{ ...box(s), boxShadow: s.shadow ? boxShadow(s.shadow) : undefined }}
          />
        );
      case "table": {
        const totalH = s.rowH.reduce((a, b) => a + b, 0);
        return (
          <table
            key={i}
            className="absolute border-collapse"
            style={{
              ...box({ x: s.x, y: s.y, w: s.w, h: totalH }),
              fontFamily: FONT_STACKS[s.font] ?? s.font,
              fontSize: pt(s.size),
              color: `#${s.textColor}`,
              tableLayout: "fixed",
              lineHeight: NATURAL_LINE_HEIGHT,
            }}
          >
            <colgroup>
              {s.colW.map((w, c) => (
                <col key={c} style={{ width: `${(w / s.w) * 100}%` }} />
              ))}
            </colgroup>
            <tbody>
              {s.cells.map((row, r) => {
                const header = s.hasHeader && r === 0;
                const zebra = !header && (s.hasHeader ? r % 2 === 0 : r % 2 === 1);
                return (
                  <tr key={r} style={{ height: `${(s.rowH[r] / totalH) * 100}%` }}>
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        style={{
                          border: s.rulesOnly ? "none" : `${pt(0.75)} solid #${s.borderColor}`,
                          borderBottom: `${pt(0.75)} solid #${s.borderColor}`,
                          padding: `${cq(0.07)} ${cq(0.1)}`,
                          background: header ? `#${s.headerFill}` : zebra ? `#${s.zebraFill}` : `#${s.bodyFill}`,
                          color: header ? `#${s.headerColor}` : undefined,
                          fontWeight: header ? 700 : 400,
                          verticalAlign: "middle",
                          overflowWrap: "break-word",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      }
    }
  };

  return (
    <div
      className={`slide-canvas ${className ?? ""}`}
      style={{
        aspectRatio: `${width} / ${height}`,
        background: slide.backgroundGradient ? cssGradient(slide.backgroundGradient) : `#${slide.background}`,
      }}
      role="img"
      aria-label={`Slide: ${slide.title}`}
    >
      {slide.shapes.map(render)}
    </div>
  );
}

export const SlideCanvas = memo(SlideCanvasInner);
