import { useRef, useState } from "react";
import { moodColor, valenceLabel } from "@/lib/mood";

export interface ValencePoint {
  /** 0 … 1 across the chart. */
  x: number;
  valence: number;
  /** What the tooltip and the table say for this point ("Fri, Oct 30", "7:12 AM"). */
  label: string;
  /** Joined to the previous point by the line. */
  joined: boolean;
}

const W = 268;
const H = 124;
const PAD = { top: 12, right: 8, bottom: 26, left: 8 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;
const xOf = (x: number) => PAD.left + x * plotW;
const yOf = (v: number) => PAD.top + ((1 - v) / 2) * plotH;

/**
 * Valence over time: one series, so no legend; a zero line as the only grid. Points are coloured
 * by the mood scale; hover or arrow keys show each value, and a hidden table carries them all.
 */
export function ValenceChart({
  points,
  ticks,
  title,
}: {
  points: ValencePoint[];
  /** Axis labels along the bottom, at x 0 … 1. */
  ticks: { x: number; label: string }[];
  title: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const nearest = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || !points.length) return null;
    const x = ((clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(xOf(points[i].x) - x) < Math.abs(xOf(points[best].x) - x)) best = i;
    }
    return best;
  };

  let line = "";
  points.forEach((p, i) => {
    line += `${p.joined && i > 0 ? "L" : "M"}${xOf(p.x).toFixed(1)},${yOf(p.valence).toFixed(1)}`;
  });
  const hit = active !== null ? points[active] : null;

  return (
    <figure className="relative m-0">
      <figcaption className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </figcaption>
      {points.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-muted-foreground">No check-ins yet.</p>
      ) : (
        <>
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-md"
            tabIndex={0}
            role="img"
            aria-label={`${title}: ${points.length} ${points.length === 1 ? "point" : "points"}. Use the arrow keys to read each one.`}
            onPointerMove={(e) => setActive(nearest(e.clientX))}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const d = e.key === "ArrowRight" ? 1 : -1;
                setActive((a) =>
                  Math.min(points.length - 1, Math.max(0, (a ?? (d > 0 ? -1 : points.length)) + d)),
                );
              }
            }}
          >
            <text x={PAD.left} y={PAD.top - 2} className="fill-muted-foreground text-[9px]">
              Pleasant
            </text>
            <text x={PAD.left} y={H - PAD.bottom + 10} className="fill-muted-foreground text-[9px]">
              Unpleasant
            </text>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yOf(0)}
              y2={yOf(0)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            {hit && (
              <line
                x1={xOf(hit.x)}
                x2={xOf(hit.x)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.4}
                strokeWidth={1}
              />
            )}
            <path
              d={line}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.55}
            />
            {points.map((p, i) => (
              <circle
                key={i}
                cx={xOf(p.x)}
                cy={yOf(p.valence)}
                r={i === active ? 5.5 : 4}
                fill={moodColor(p.valence)}
                stroke="var(--chrome)"
                strokeWidth={2}
              />
            ))}
            {ticks.map((t) => (
              <text
                key={t.x}
                x={xOf(t.x)}
                y={H - 2}
                textAnchor={t.x === 0 ? "start" : t.x === 1 ? "end" : "middle"}
                className="fill-muted-foreground text-[9px] tabular-nums"
              >
                {t.label}
              </text>
            ))}
          </svg>
          {hit && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-[11px] whitespace-nowrap shadow-md"
              style={{
                left: `${(xOf(hit.x) / W) * 100}%`,
                top: `calc(${(yOf(hit.valence) / H) * 100}% - 18px)`,
              }}
            >
              <span className="text-muted-foreground">{hit.label}</span> ·{" "}
              {valenceLabel(hit.valence)}
            </div>
          )}
          <table className="sr-only">
            <caption>{title}</caption>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <th scope="row">{p.label}</th>
                  <td>{valenceLabel(p.valence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </figure>
  );
}
