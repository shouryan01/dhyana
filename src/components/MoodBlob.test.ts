import { describe, expect, it } from "vitest";
import { blobPath, WANDER } from "./MoodBlob";

const points = (d: string) =>
  d
    .slice(1, -1)
    .split("L")
    .map((p) => p.split(",").map(Number) as [number, number]);

describe("mood shape", () => {
  it("is drawn around the middle of a 0-based 200 x 200 box, at every mood", () => {
    // The CSS spin turns it about that middle; a shape drawn around (0, 0) would orbit the corner.
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      const pts = points(blobPath(v));
      expect(pts).toHaveLength(120);
      const cx = pts.reduce((s, [x]) => s + x, 0) / pts.length;
      const cy = pts.reduce((s, [, y]) => s + y, 0) / pts.length;
      expect(Math.abs(cx - 100)).toBeLessThan(3);
      expect(Math.abs(cy - 100)).toBeLessThan(3);
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(200);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(200);
      }
      // Even at the far corner of its bouncing, no point leaves the frame.
      for (const [x, y] of pts) {
        expect(Math.abs(x - 100) + WANDER).toBeLessThanOrEqual(100);
        expect(Math.abs(y - 100) + WANDER).toBeLessThanOrEqual(100);
      }
    }
  });
});
