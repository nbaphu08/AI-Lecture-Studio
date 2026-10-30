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
