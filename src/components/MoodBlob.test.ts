import { describe, expect, it } from "vitest";
import { type Bounce, blobPath, stepBounce } from "./MoodBlob";

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

describe("bouncing like a DVD logo", () => {
  const speed = (p: Bounce) => Math.hypot(p.vx, p.vy);

  it("flies straight until it meets a wall, then flips only that axis", () => {
    const start: Bounce = { x: 0, y: 0, vx: 40, vy: 20 };
    const free = stepBounce(start, 1, 100, 100);
    expect(free).toEqual({ x: 40, y: 20, vx: 40, vy: 20 });

    const hitRight = stepBounce({ x: 95, y: 0, vx: 40, vy: 20 }, 0.5, 100, 100);
    expect(hitRight.x).toBeCloseTo(85); // 95 + 20 = 115, reflected about 100
    expect(hitRight.vx).toBe(-40);
    expect(hitRight.vy).toBe(20); // the other axis is untouched

    const hitTop = stepBounce({ x: 0, y: -95, vx: 40, vy: -20 }, 1, 100, 100);
    expect(hitTop.y).toBeCloseTo(-85);
    expect(hitTop.vy).toBe(20);
    expect(hitTop.vx).toBe(40);
  });

  it("never leaves the box and never changes speed, over a long run", () => {
    let p: Bounce = { x: 0, y: 0, vx: 46, vy: 33 };
    const v0 = speed(p);
    for (let i = 0; i < 20000; i++) {
      p = stepBounce(p, 1 / 60, 90, 40);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(90);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(40);
      expect(speed(p)).toBeCloseTo(v0);
    }
  });

  it("survives a huge time step (a backgrounded tab) and a box too small to move in", () => {
    const far = stepBounce({ x: 0, y: 0, vx: 46, vy: 33 }, 500, 90, 40);
    expect(Math.abs(far.x)).toBeLessThanOrEqual(90);
    expect(Math.abs(far.y)).toBeLessThanOrEqual(40);
    const squeezed = stepBounce({ x: 10, y: 10, vx: 46, vy: 33 }, 1, 0, -5);
    expect(squeezed.x).toBe(0);
    expect(squeezed.y).toBe(0);
  });
});
