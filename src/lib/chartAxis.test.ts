import { describe, expect, it } from "vitest";
import { monthTicks } from "./chartAxis";

describe("monthTicks", () => {
  it("labels the first of each month inside the range, with the year on January", () => {
    expect(monthTicks("2026-01-02", "2026-04-19").map((t) => [t.date, t.label])).toEqual([
      ["2026-02-01", "Feb"],
      ["2026-03-01", "Mar"],
      ["2026-04-01", "Apr"],
    ]);
    expect(monthTicks("2025-11-15", "2026-02-10").map((t) => t.label)).toEqual([
      "Dec",
      "Jan 2026",
      "Feb",
    ]);
  });

  it("includes the first day itself when it is a month start", () => {
    expect(monthTicks("2026-03-01", "2026-03-31").map((t) => t.date)).toEqual(["2026-03-01"]);
  });

  it("thins long ranges so the axis never crowds", () => {
    const ticks = monthTicks("2024-01-01", "2026-12-31", 8);
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(ticks[0].date).toBe("2024-01-01");
  });

  it("falls back to the two ends when the range has no month start", () => {
    expect(monthTicks("2026-03-05", "2026-03-20")).toHaveLength(2);
    expect(monthTicks("2026-03-05", "2026-03-05")).toHaveLength(1);
  });
});
