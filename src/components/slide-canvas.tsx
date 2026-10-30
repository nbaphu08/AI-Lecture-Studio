"use client";

import { memo, useId } from "react";
import { NATURAL_LINE_HEIGHT } from "@/lib/design/text-utils";
import type { ComposedSlide, Shape } from "@/lib/pptx/draw";

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
  const box = (s: { x: number; y: number; w: number; h: number }) => ({
    left: `${(s.x / width) * 100}%`,
    top: `${(s.y / height) * 100}%`,
    width: `${(s.w / width) * 100}%`,
    height: `${(s.h / height) * 100}%`,
  });

  const render = (s: Shape, i: number) => {
    switch (s.t) {
      case "rect":
        return (
          <div
            key={i}
            className="absolute"
            style={{
              ...box(s),
              background: s.fill ? `#${s.fill}` : undefined,
              border: s.line ? `${pt(s.line.width)} solid #${s.line.color}` : undefined,
              borderRadius: s.radius ? cq(s.radius) : undefined,
            }}
          />
        );
      case "ellipse":
        return (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              ...box(s),
              background: s.fill ? `#${s.fill}` : undefined,
              border: s.line ? `${pt(s.line.width)} solid #${s.line.color}` : undefined,
            }}
          />
        );
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
              color: `#${s.color}`,
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
                    color: p.color ? `#${p.color}` : undefined,
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
          <img key={i} src={s.src} alt={s.alt ?? ""} className="absolute object-contain" style={box(s)} />
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
                          border: `${pt(0.75)} solid #${s.borderColor}`,
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
      style={{ aspectRatio: `${width} / ${height}`, background: `#${slide.background}` }}
      role="img"
      aria-label={`Slide: ${slide.title}`}
    >
      {slide.shapes.map(render)}
    </div>
  );
}

export const SlideCanvas = memo(SlideCanvasInner);
