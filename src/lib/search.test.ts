import { describe, expect, it } from "vitest";
import { buildAnalyticsDays, searchDays } from "./memorySearch";
import { parseBar, periodRange, snippetParts } from "./searchBar";

const people = [
  { kind: "person", name: "Alex", aliases: ["Al"], title: null },
  { kind: "place", name: "Cafe Nero", aliases: [], title: null },
  { kind: "emotion", name: "sad", aliases: [], title: null },
  { kind: "emotion", name: "calm", aliases: [], title: null },
];
const TODAY = "2026-03-15";

describe("parseBar", () => {
  it("splits words from filters and resolves aliases", () => {
    const { query, problems } = parseBar("walk river @al #outdoors !calm", people, TODAY);
    expect(query.text).toBe("walk river");
    expect(query.people).toEqual(["Alex"]);
    expect(query.tags).toEqual(["outdoors"]);
    expect(query.emotions).toEqual(["calm"]);
    expect(problems).toEqual([]);
  });

  it("accepts quoted names and key:value forms", () => {
    const { query } = parseBar('@"Cafe Nero" person:Alex tag:work emotion:sad', people, TODAY);
    expect(query.people).toEqual(["Cafe Nero", "Alex"]);
    expect(query.tags).toEqual(["work"]);
    expect(query.emotions).toEqual(["sad"]);
  });

  it("keeps unknown names in the filter, so they match nothing rather than everything", () => {
    const { query, problems, invalid } = parseBar("@Zed !glee", people, TODAY);
    expect(query.people).toEqual(["Zed"]);
    expect(query.emotions).toEqual(["glee"]);
    expect(problems).toEqual(["@Zed", "!glee"]);
    expect(invalid).toBe(false);
  });

  it("flags unreadable dates and moods as invalid", () => {
    for (const bar of ["from:nope", "in:someday", "last:0d", "mood:lots"]) {
      const p = parseBar(bar, people, TODAY);
      expect(p.invalid, bar).toBe(true);
      expect(p.problems, bar).toEqual([bar]);
    }
    expect(parseBar("in:2026-03 mood:>0", people, TODAY).invalid).toBe(false);
  });

  it("reads dates and periods", () => {
    expect(parseBar("from:2026-01-01 to:2026-02-01", people, TODAY).query).toMatchObject({
      from: "2026-01-01",
      to: "2026-02-01",
    });
    expect(parseBar("on:2026-03-02", people, TODAY).query).toMatchObject({
      from: "2026-03-02",
      to: "2026-03-02",
    });
    expect(parseBar("in:last-month", people, TODAY).query).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(parseBar("last:7d", people, TODAY).query).toMatchObject({
      from: "2026-03-09",
      to: TODAY,
    });
    expect(parseBar("last:3m", people, TODAY).query.from).toBe("2025-12-16");
  });

  it("wraps January back to last December", () => {
    expect(periodRange("last-month", "2026-01-10")).toEqual(["2025-12-01", "2025-12-31"]);
    expect(periodRange("2024-02", TODAY)).toEqual(["2024-02-01", "2024-02-29"]);
    expect(periodRange("2025", TODAY)).toEqual(["2025-01-01", "2025-12-31"]);
    expect(periodRange("someday", TODAY)).toBeNull();
  });

  it("reads mood ranges", () => {
    const m = (s: string) => {
      const { query } = parseBar(`mood:${s}`, people, TODAY);
      return [query.moodMin, query.moodMax];
    };
    expect(m(">0.2")).toEqual([0.2, null]);
    expect(m("<-0.2")).toEqual([null, -0.2]);
    expect(m("-0.5..0.5")).toEqual([-0.5, 0.5]);
    expect(m("positive")).toEqual([0.15, null]);
    expect(parseBar("mood:lots", people, TODAY).problems).toEqual(["mood:lots"]);
  });

  it("is empty only when nothing is asked", () => {
    expect(parseBar("   ", people, TODAY).empty).toBe(true);
    expect(parseBar("#x", people, TODAY).empty).toBe(false);
    expect(parseBar("a lone # and !", people, TODAY).query.text).toBe("a lone # and !");
  });
});

describe("snippetParts", () => {
  it("separates highlighted words", () => {
    expect(snippetParts("a \u0001big\u0002 day")).toEqual([
      { text: "a ", hit: false },
      { text: "big", hit: true },
      { text: " day", hit: false },
    ]);
  });
});

describe("searchDays", () => {
  const days = buildAnalyticsDays(
    {
      "2026-03-02": {
        body: "Walked with [[Alex]] by the river. #outdoors",
        mood: [{ at: "09:00", valence: 0.6, emotions: ["calm"], factors: [] }],
      },
      "2026-03-05": {
        body: "Working late again, feeling [[sad]]. #work",
        mood: [{ at: "09:00", valence: -0.5, emotions: ["sad"], factors: [] }],
      },
      "2026-04-01": { body: "Coffee at [[Cafe Nero]] with [[Al]]." },
    },
    people,
  );
  const run = (bar: string) =>
    searchDays(days, parseBar(bar, people, TODAY).query).map((h) => h.date);

  it("finds text, newest first, with the last word as a prefix", () => {
    expect(run("riv")).toEqual(["2026-03-02"]);
    expect(run("")).toEqual(["2026-04-01", "2026-03-05", "2026-03-02"]);
  });

  it("filters by person (aliases too), tag, emotion, mood and dates", () => {
    expect(run("@Alex")).toEqual(["2026-04-01", "2026-03-02"]);
    expect(run("#work")).toEqual(["2026-03-05"]);
    expect(run("!sad")).toEqual(["2026-03-05"]);
    expect(run("mood:>0")).toEqual(["2026-03-02"]);
    expect(run("mood:<0")).toEqual(["2026-03-05"]);
    expect(run("in:2026-03")).toEqual(["2026-03-05", "2026-03-02"]);
    expect(run("@Alex in:2026-03")).toEqual(["2026-03-02"]);
    expect(run("late @Alex")).toEqual([]);
    expect(run("@Dwight")).toEqual([]); // unknown person: nothing, not everything
  });

  it("marks the matched words", () => {
    const [hit] = searchDays(days, parseBar("river", people, TODAY).query);
    expect(hit.snippet).toContain("\u0001river\u0002");
  });
});
