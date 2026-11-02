import { describe, expect, it } from "vitest";
import {
  analyze,
  coOccurrence,
  correlations,
  dailyWords,
  emotionFrequency,
  entriesPerMonth,
  mentionsOverTime,
  moodByTimeOfDay,
  mostMentioned,
  plainText,
  streaks,
  syllables,
  tagFrequency,
  timeOfDay,
  topTermsByMonth,
  valenceSeries,
  weekdayPattern,
  writingStyle,
} from "./analytics";
import type { AnalyticsDay } from "./schema";
import { syntheticDays } from "./syntheticDays";

const TODAY = "2026-03-10";
const day = (date: string, over: Partial<AnalyticsDay> = {}): AnalyticsDay => ({
  date,
  words: 0,
  created: null,
  body: "",
  moods: [],
  tags: [],
  links: [],
  ...over,
});
const ci = (at: string, valence: number, emotions: string[] = []) => ({
  at,
  valence,
  emotions,
  factors: [],
});
const alex = { name: "Alex", kind: "person" };
const sam = { name: "Sam", kind: "person" };

/**
 * A small journal worked out by hand. 2026-03-01 is a Sunday; 2026-01-15 is a Thursday.
 * Mood days: 03-01 (avg 0.4), 03-02 (-0.4), 03-05 (0.2), 03-10 (0.6) → baseline 0.2.
 */
const FIXTURE: AnalyticsDay[] = [
  day("2026-01-15", { words: 5, created: "2026-01-15T23:30:00+00:00" }),
  day("2026-03-01", {
    words: 10,
    created: "2026-03-01T08:15:00+00:00",
    moods: [ci("08:00", 0.5, ["calm"]), ci("20:00", 0.3, ["happy"])],
    links: [alex, { name: "Cafe Nero", kind: "place" }],
    tags: ["work"],
  }),
  day("2026-03-02", {
    words: 20,
    created: "2026-03-02T21:40:00+00:00",
    moods: [ci("22:00", -0.4, ["sad"])],
    links: [alex, sam, { name: "sad", kind: "emotion" }],
    tags: ["work", "gym"],
  }),
  day("2026-03-03", { words: 30, links: [alex] }),
  day("2026-03-05", {
    words: 40,
    created: "2026-03-05T08:05:00+00:00",
    moods: [ci("09:00", 0.2, ["calm"])],
    links: [sam],
    tags: ["gym"],
  }),
  day("2026-03-09", { words: 50, created: "2026-03-09T07:59:00+00:00" }),
  day("2026-03-10", {
    words: 60,
    created: "2026-03-10T08:00:00+00:00",
    moods: [ci("07:00", 0.6, ["calm"])],
    links: [alex],
    tags: ["work"],
  }),
];

describe("consistency", () => {
  it("streaks: longest run, and the run that ends today", () => {
    expect(
      streaks(
        FIXTURE.map((d) => d.date),
        TODAY,
      ),
    ).toEqual({ current: 2, longest: 3 });
  });

  it("a blank today keeps yesterday's streak alive; a gap breaks it", () => {
    const dates = ["2026-03-07", "2026-03-08", "2026-03-09"];
    expect(streaks(dates, TODAY).current).toBe(3);
    expect(streaks(dates, "2026-03-11").current).toBe(0);
    expect(streaks([], TODAY)).toEqual({ current: 0, longest: 0 });
  });

  it("entries and words per month, zero-filled", () => {
    expect(entriesPerMonth(FIXTURE)).toEqual([
      { month: "2026-01", entries: 1, words: 5 },
      { month: "2026-02", entries: 0, words: 0 },
      { month: "2026-03", entries: 6, words: 210 },
    ]);
    expect(entriesPerMonth([])).toEqual([]);
  });

  it("words per day over a range, zero on blank days", () => {
    expect(dailyWords(FIXTURE, "2026-03-03", "2026-03-06")).toEqual([
      { date: "2026-03-03", words: 30 },
      { date: "2026-03-04", words: 0 },
      { date: "2026-03-05", words: 40 },
      { date: "2026-03-06", words: 0 },
    ]);
  });

  it("time of day uses the created hour and counts the files without one", () => {
    const t = timeOfDay(FIXTURE);
    expect(t.counted).toBe(6);
    expect(t.missing).toBe(1);
    expect(t.bins[8]).toBe(3);
    expect(t.bins[7]).toBe(1);
    expect(t.bins[21]).toBe(1);
    expect(t.bins[23]).toBe(1);
    expect(t.bins.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("weekday pattern, Monday first", () => {
    const w = weekdayPattern(FIXTURE);
    expect(w[0]).toEqual({ entries: 2, avgWords: 35, avgValence: -0.4 }); // Mon: 03-02, 03-09
    expect(w[1]).toEqual({ entries: 2, avgWords: 45, avgValence: 0.6 }); // Tue: 03-03, 03-10
    expect(w[2]).toEqual({ entries: 0, avgWords: null, avgValence: null });
    expect(w[3]).toEqual({ entries: 2, avgWords: 22.5, avgValence: 0.2 }); // Thu: 01-15, 03-05
    expect(w[6]).toEqual({ entries: 1, avgWords: 10, avgValence: 0.4 }); // Sun: 03-01
  });
});

describe("mood", () => {
  it("smooths over a trailing window of calendar days", () => {
    expect(valenceSeries(FIXTURE)).toEqual([
      { date: "2026-03-01", valence: 0.4, smooth: 0.4 },
      { date: "2026-03-02", valence: -0.4, smooth: 0 },
      { date: "2026-03-05", valence: 0.2, smooth: 0.07 }, // (0.4 - 0.4 + 0.2) / 3
      { date: "2026-03-10", valence: 0.6, smooth: 0.4 }, // window 03-04…03-10: (0.2 + 0.6) / 2
    ]);
  });

  it("keeps check-in emotions and inline emotions apart", () => {
    expect(emotionFrequency(FIXTURE)).toEqual([
      { emotion: "calm", checkins: 3, inline: 0 },
      { emotion: "sad", checkins: 1, inline: 1 },
      { emotion: "happy", checkins: 1, inline: 0 },
    ]);
  });

  it("mood by the time of day of the check-in", () => {
    const m = moodByTimeOfDay(FIXTURE);
    expect(m[0]).toEqual({ checkins: 0, avgValence: null }); // night
    expect(m[1]).toEqual({ checkins: 3, avgValence: 0.43 }); // 0.5, 0.2, 0.6
    expect(m[2]).toEqual({ checkins: 0, avgValence: null });
    expect(m[3]).toEqual({ checkins: 2, avgValence: -0.05 }); // 0.3, -0.4 (22:00 and 20:00)
  });

  it("correlations against the baseline, small samples flagged and listed last-resort", () => {
    const c = correlations(FIXTURE);
    expect(c.baseline).toBe(0.2);
    expect(c.moodDays).toBe(4);
    const row = (name: string) => c.rows.find((r) => r.name === name)!;
    expect(row("Alex")).toMatchObject({ kind: "person", days: 3, avgValence: 0.2, delta: 0 });
    expect(row("Sam")).toMatchObject({ days: 2, avgValence: -0.1, delta: -0.3 });
    expect(row("Cafe Nero")).toMatchObject({ kind: "place", days: 1, delta: 0.2 });
    expect(row("gym")).toMatchObject({ kind: "tag", days: 2, delta: -0.3 });
    expect(c.rows.every((r) => r.small)).toBe(true);
    // Inline emotions are not people, places or tags.
    expect(c.rows.find((r) => r.name === "sad")).toBeUndefined();
  });

  it("a mention counts once per day and large samples sort first", () => {
    const days = Array.from({ length: 6 }, (_, i) =>
      day(`2026-02-0${i + 1}`, {
        moods: [ci("09:00", 0.5)],
        links: i < 6 ? [alex, alex] : [],
      }),
    );
    days.push(day("2026-02-09", { moods: [ci("09:00", -0.5)], links: [sam] }));
    const c = correlations(days);
    expect(c.rows[0]).toMatchObject({ name: "Alex", days: 6, small: false });
    expect(c.rows[1]).toMatchObject({ name: "Sam", days: 1, small: true });
  });

  it("no check-ins, no baseline", () => {
    expect(correlations([day("2026-03-01", { links: [alex] })])).toEqual({
      baseline: null,
      rows: [],
      moodDays: 0,
    });
  });
});

describe("people & topics", () => {
  it("ranks people by mentions with first/last and a 90-day trend", () => {
    const people = mostMentioned(FIXTURE, "person", TODAY);
    expect(people).toEqual([
      {
        name: "Alex",
        kind: "person",
        mentions: 4,
        days: 4,
        first: "2026-03-01",
        last: "2026-03-10",
        trend: 4,
      },
      {
        name: "Sam",
        kind: "person",
        mentions: 2,
        days: 2,
        first: "2026-03-02",
        last: "2026-03-05",
        trend: 2,
      },
    ]);
    expect(mostMentioned(FIXTURE, "place", TODAY).map((p) => p.name)).toEqual(["Cafe Nero"]);
  });

  it("trend goes negative when mentions fade", () => {
    const old = [
      day("2025-10-01", { links: [alex] }),
      day("2025-10-02", { links: [alex] }),
      day("2026-03-01", { links: [alex] }),
    ];
    // Recent window starts 2025-12-12, prior one 2025-09-13.
    expect(mostMentioned(old, "person", TODAY)[0].trend).toBe(1 - 2);
  });

  it("mentions per month and who appears together", () => {
    expect(mentionsOverTime(FIXTURE, "alex")).toEqual([{ month: "2026-03", days: 4 }]);
    expect(coOccurrence(FIXTURE)).toEqual([{ a: "Alex", b: "Sam", days: 1 }]);
  });

  it("tag frequency counts entries, not repeats", () => {
    expect(tagFrequency(FIXTURE)).toEqual([
      { tag: "work", entries: 3 },
      { tag: "gym", entries: 2 },
    ]);
    expect(tagFrequency([day("2026-03-01", { tags: ["a", "A", "a"] })])).toEqual([
      { tag: "a", entries: 1 },
    ]);
  });

  it("top terms per month by tf-idf, stopwords and markup ignored", () => {
    const terms = topTermsByMonth([
      day("2026-01-03", { body: "River river walk and the #work [[Alex]]" }),
      day("2026-02-03", { body: "Garden garden walk" }),
    ]);
    expect(terms.map((t) => t.month)).toEqual(["2026-01", "2026-02"]);
    expect(terms[0].terms[0].term).toBe("river");
    expect(terms[1].terms[0].term).toBe("garden");
    // "walk" is in both months, so it ranks below each month's own word.
    expect(terms[0].terms.map((t) => t.term)).toContain("walk");
    expect(terms[0].terms.map((t) => t.term)).not.toContain("the");
    expect(terms[0].terms.map((t) => t.term)).not.toContain("work");
  });
});

describe("writing style", () => {
  it("counts sentences, pronouns, tense markers and rates", () => {
    const s = writingStyle([
      day("2026-03-01", { words: 9, body: "I went home. We ate dinner! Did I forget?" }),
    ]);
    expect(s.words).toBe(9);
    expect(s.sentences).toBe(3);
    expect(s.avgSentenceLength).toBe(3);
    expect(s.uniqueWords).toBe(8);
    expect(s.richness).toBe(2.67);
    expect(s.singular).toBe(2);
    expect(s.plural).toBe(1);
    expect(s.singularShare).toBe(0.67);
    expect(s.tense).toEqual({ past: 1, present: 0, future: 0 });
    expect(s.questionRate).toBe(0.33);
    expect(s.exclamationRate).toBe(0.33);
    expect(s.sentiment).toBeNull();
  });

  it("sentiment from the word list, longest and shortest entries", () => {
    const s = writingStyle([
      day("2026-03-01", { words: 3, body: "A good happy day" }),
      day("2026-03-02", { words: 6, body: "Tired and sad. Good coffee though." }),
      day("2026-03-03", { words: 0, body: "" }),
    ]);
    // good, happy, good = 3 positive; tired, sad = 2 negative.
    expect(s.sentiment).toBe(0.2);
    expect(s.longest).toEqual({ date: "2026-03-02", words: 6 });
    expect(s.shortest).toEqual({ date: "2026-03-01", words: 3 });
  });

  it("an empty journal has no scores rather than NaN", () => {
    const s = writingStyle([]);
    expect(s).toMatchObject({
      words: 0,
      richness: null,
      gradeLevel: null,
      longest: null,
      tense: null,
    });
  });

  it("syllables and plain text", () => {
    expect(["cat", "table", "banana", "walked", "reading"].map(syllables)).toEqual([1, 2, 3, 1, 2]);
    const t = plainText("# Title\n- [[Alex|Al]] went to [site](http://x.com) #work `code`");
    expect(t).toContain("Title");
    expect(t).toContain("Al went to site");
    expect(t).not.toMatch(/Alex|http|work|code/);
  });
});

describe("the whole dashboard", () => {
  it("analyzes the fixture", () => {
    const a = analyze(FIXTURE, TODAY);
    expect(a).toMatchObject({
      entries: 7,
      words: 215,
      firstDate: "2026-01-15",
      streak: { current: 2, longest: 3 },
    });
  });

  it("handles an empty journal", () => {
    const a = analyze([], TODAY);
    expect(a.entries).toBe(0);
    expect(a.months).toEqual([]);
    expect(a.correlations.baseline).toBeNull();
  });

  it("computes three years of entries well inside a second", () => {
    const days = syntheticDays(3 * 365, TODAY);
    expect(days.length).toBeGreaterThan(900);
    const t0 = performance.now();
    const a = analyze(days, TODAY);
    const ms = performance.now() - t0;
    expect(a.entries).toBe(days.length);
    expect(ms).toBeLessThan(1000);
  });
});
