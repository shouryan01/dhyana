import { describe, expect, it } from "vitest";
import { blobPath } from "./MoodBlob";

const points = (d: string) =>
  d
    .slice(1, -1)
    .split("L")
    .map((p) => p.split(",").map(Number) as [number, number]);

describe("mood shape", () => {
  it("is drawn around (0, 0) and fits the small-size frame at every mood", () => {
    // The turning and breathing layers pivot on (0, 0), so the shape has to be centred there.
    // The smallest frame (the little shape in chips and summaries) spans -80 to 80.
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      for (const phase of [0, 0.5]) {
        const pts = points(blobPath(v, phase));
        expect(pts).toHaveLength(180);
        const cx = pts.reduce((s, [x]) => s + x, 0) / pts.length;
        const cy = pts.reduce((s, [, y]) => s + y, 0) / pts.length;
        expect(Math.abs(cx)).toBeLessThan(3);
        expect(Math.abs(cy)).toBeLessThan(3);
        for (const [x, y] of pts) {
          expect(Math.abs(x)).toBeLessThanOrEqual(80);
          expect(Math.abs(y)).toBeLessThanOrEqual(80);
        }
      }
    }
  });
});
