import { useEffect, useId, useMemo, useRef, useState } from "react";
import { moodColor } from "@/lib/mood";

const POINTS = 180;
const R = 58;

/**
 * The outline for a valence: a spiky star when unpleasant, a circle at neutral, a round-petalled
 * flower when pleasant. Always the same number of points, so it morphs smoothly between them.
 * `phase` turns the pattern by a fraction of one spike or petal (for the interleaved back layer).
 */
export function blobPath(v: number, phase = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < POINTS; i++) {
    const t = (i / POINTS) * Math.PI * 2;
    let r = R;
    if (v < 0) {
      // Sharp tips, wide round valleys.
      const s = (1 - Math.abs(Math.sin((t * 11) / 2 + phase * Math.PI))) ** 1.6;
      r = R * (1 + -v * (0.42 * s - 0.2));
    } else if (v > 0) {
      // Fat petals pinched where they meet.
      const c = Math.abs(Math.cos((t * 8) / 2 + phase * Math.PI)) ** 0.55;
      r = R * (1 + v * (0.26 * c - 0.14));
    }
    pts.push(`${(r * Math.cos(t)).toFixed(1)},${(r * Math.sin(t)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Follows `target` with a soft spring, so a jump (a key press, a click on the track) glides
 * rather than snaps. Reduced-motion users get the value straight away.
 */
export function useSpring(target: number): number {
  const [value, setValue] = useState(target);
  const state = useRef({ x: target, v: 0 });
  useEffect(() => {
    const s = state.current;
    if (reducedMotion()) {
      s.x = target;
      s.v = 0;
      setValue(target);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      // Slightly under-damped: settles with the faintest overshoot.
      s.v += (260 * (target - s.x) - 26 * s.v) * dt;
      s.x += s.v * dt;
      if (Math.abs(target - s.x) < 0.001 && Math.abs(s.v) < 0.01) {
        s.x = target;
        s.v = 0;
        setValue(target);
        return;
      }
      setValue(s.x);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

/**
 * The mood shape, drawn in layers: a soft glow, an interleaved back layer turning one way, the
 * main shape turning the other, and a lighter heart. Colour comes from the mood scale. `glyph`
 * draws just the main shape, still, for small sizes (chips, summaries).
 */
export function MoodBlob({
  valence,
  size = 150,
  glyph = false,
}: {
  valence: number;
  size?: number;
  glyph?: boolean;
}) {
  const id = `mood-${useId().replace(/[^\w-]/g, "")}`;
  const color = moodColor(valence);
  const main = useMemo(() => blobPath(valence), [valence]);
  const back = useMemo(() => (glyph ? "" : blobPath(valence, 0.5)), [valence, glyph]);
  const fill = `url(#${id}-fill)`;
  const light = (pct: number) => `color-mix(in oklab, ${color}, white ${pct}%)`;

  return (
    <svg
      viewBox={glyph ? "-80 -80 160 160" : "-100 -100 200 200"}
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <defs>
        <radialGradient id={`${id}-fill`} cx="0" cy="0" r={R * 1.2} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={light(38)} />
          <stop offset="0.55" stopColor={light(10)} />
          <stop offset="1" stopColor={color} />
        </radialGradient>
        {!glyph && (
          <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        )}
      </defs>
      {glyph ? (
        <path d={main} fill={fill} />
      ) : (
        <>
          <g className="mood-breathe">
            <path
              d={main}
              transform="scale(1.08)"
              fill={color}
              opacity={0.5}
              filter={`url(#${id}-glow)`}
            />
          </g>
          <g className="mood-turn-back">
            <path d={back} transform="scale(0.94)" fill={color} opacity={0.42} />
          </g>
          <g className="mood-turn">
            <g className="mood-breathe">
              <path d={main} fill={fill} />
              <path d={main} transform="scale(0.5)" fill={light(55)} opacity={0.45} />
            </g>
          </g>
        </>
      )}
    </svg>
  );
}
