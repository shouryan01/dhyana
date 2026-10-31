import { describe, expect, it } from "vitest";
import { formatClock, from12, parseClock, to12 } from "./time";

describe("time picker helpers", () => {
  it("reads and writes HH:MM", () => {
    expect(parseClock("07:05")).toEqual({ h: 7, m: 5 });
    expect(parseClock("23:59")).toEqual({ h: 23, m: 59 });
    expect(parseClock("nonsense")).toEqual({ h: 0, m: 0 });
    expect(formatClock({ h: 7, m: 5 })).toBe("07:05");
  });

  it("converts between the 24-hour value and a 12-hour clock", () => {
    expect(to12(0)).toEqual({ h: 12, pm: false });
    expect(to12(9)).toEqual({ h: 9, pm: false });
    expect(to12(12)).toEqual({ h: 12, pm: true });
    expect(to12(15)).toEqual({ h: 3, pm: true });
    expect(to12(23)).toEqual({ h: 11, pm: true });
    for (let h = 0; h < 24; h++) {
      const { h: h12, pm } = to12(h);
      expect(from12(h12, pm)).toBe(h);
    }
  });
});
