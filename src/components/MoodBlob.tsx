import { useMemo } from "react";
import { moodColor } from "@/lib/mood";

const POINTS = 120;
const R = 62;
/**
 * The shape is drawn around the middle of a 0-based 200 x 200 box. The viewBox must start at 0:
 * a CSS rotation's origin ignores a viewBox that starts at a negative offset, so the shape
 * would orbit the frame's corner instead of turning in place (and leave the dialog).
 */
const SIZE = 200;
const CENTER = SIZE / 2;

/**
 * The outline for a valence: a spiky star when unpleasant, a circle at neutral, a soft flower
 * when pleasant. Always the same number of points, so it changes smoothly as the slider moves.
 */
export function blobPath(v: number): string {
  const pts: string[] = [];
  for (let i = 0; i < POINTS; i++) {
    const t = (i / POINTS) * Math.PI * 2;
    let r = R;
    if (v < 0) {
      const k = 12;
      const phase = ((t * k) / (Math.PI * 2)) % 1;
      const tri = 1 - 4 * Math.abs(phase - 0.5); // -1 at the notches, 1 at the tips
      r = R * (1 - 0.12 * -v + 0.3 * -v * tri);
    } else if (v > 0) {
      r = R * (1 + 0.16 * v * Math.cos(t * 7));
    }
    pts.push(`${(CENTER + r * Math.cos(t)).toFixed(1)},${(CENTER + r * Math.sin(t)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

export function MoodBlob({ valence, size = 150 }: { valence: number; size?: number }) {
  const d = useMemo(() => blobPath(valence), [valence]);
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={size} height={size} aria-hidden="true">
      <g className="mood-blob">
        <path d={d} style={{ fill: moodColor(valence) }} />
      </g>
    </svg>
  );
}
