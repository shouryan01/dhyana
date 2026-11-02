import { describe, expect, it } from "vitest";
import { FACTORS } from "@/lib/mood";
import { CheckInSchema, SEEDED_EMOTIONS } from "@/lib/schema";
import { SAMPLE_CHECKINS } from "./dwightCheckIns";
import { SAMPLE_ENTRIES, SAMPLE_PEOPLE, SAMPLE_PLACES } from "./dwightSchrute";

const links = (body: string) =>
  [...body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1]);

describe("Dwight Schrute sample journal", () => {
  it("has 20 to 30 entries, one per day, all in 2026, in date order", () => {
    expect(SAMPLE_ENTRIES.length).toBeGreaterThanOrEqual(20);
    expect(SAMPLE_ENTRIES.length).toBeLessThanOrEqual(30);
    const dates = SAMPLE_ENTRIES.map((e) => e.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates.every((d) => /^2026-\d{2}-\d{2}$/.test(d))).toBe(true);
    expect([...dates].sort()).toEqual(dates);
  });

  it("links only to people, places and starter emotions that the sample creates", () => {
    const known = new Set<string>([...SAMPLE_PEOPLE, ...SAMPLE_PLACES, ...SEEDED_EMOTIONS]);
    for (const e of SAMPLE_ENTRIES) {
      for (const name of links(e.body))
        expect(known.has(name), `${e.date}: [[${name}]]`).toBe(true);
    }
  });

  it("has one valid mood check-in per entry, on a day that exists", () => {
    const days = new Set(SAMPLE_ENTRIES.map((e) => e.date));
    expect(Object.keys(SAMPLE_CHECKINS).sort()).toEqual([...days].sort());
    for (const [date, c] of Object.entries(SAMPLE_CHECKINS)) {
      expect(CheckInSchema.safeParse(c).success, date).toBe(true);
      for (const e of c.emotions) expect(SEEDED_EMOTIONS).toContain(e);
      for (const f of c.factors) expect(FACTORS.map(([id]) => id)).toContain(f);
    }
  });
});
