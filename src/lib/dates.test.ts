import { describe, expect, it } from "vitest";
import { addMonths, parseDateInput } from "./dates";

// Wednesday, 2026-10-28
const BASE = "2026-10-28";
const p = (s: string) => parseDateInput(s, BASE);

describe("parseDateInput", () => {
  it("keeps the existing forms", () => {
    expect(p("2026-12-25")).toBe("2026-12-25");
    expect(p("tomorrow")).toBe("2026-10-29");
    expect(p("yesterday")).toBe("2026-10-27");
    expect(p("-3")).toBe("2026-10-25");
    expect(p("friday")).toBe("2026-10-30");
    expect(p("next monday")).toBe("2026-11-02");
    expect(p("last friday")).toBe("2026-10-23");
  });

  it("understands relative spans", () => {
    expect(p("in 3 days")).toBe("2026-10-31");
    expect(p("in a week")).toBe("2026-11-04");
    expect(p("in 2 weeks")).toBe("2026-11-11");
    expect(p("in 1 month")).toBe("2026-11-28");
    expect(p("next week")).toBe("2026-11-04");
    expect(p("next month")).toBe("2026-11-28");
  });

  it("understands month and day in several shapes", () => {
    expect(p("dec 25")).toBe("2026-12-25");
    expect(p("December 25th")).toBe("2026-12-25");
    expect(p("25 dec")).toBe("2026-12-25");
    expect(p("12/25")).toBe("2026-12-25");
    expect(p("dec 25 2027")).toBe("2027-12-25");
    expect(p("25 december, 2028")).toBe("2028-12-25");
  });

  it("picks the next occurrence when the year is left out", () => {
    expect(p("oct 28")).toBe("2026-10-28"); // today counts
    expect(p("oct 27")).toBe("2027-10-27");
    expect(p("jan 5")).toBe("2027-01-05");
  });

  it("rejects things that aren't dates", () => {
    for (const bad of ["", "feb 30", "13/40", "dec", "blah 12", "sat 5", "in 3 fortnights"]) {
      expect(p(bad), bad).toBeNull();
    }
  });
});

describe("addMonths", () => {
  it("clamps to the end of shorter months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 2)).toBe("2027-02-15");
  });
});
