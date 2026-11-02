/**
 * Analytics, computed locally from the journal days (no AI, no network). Pure functions over
 * `AnalyticsDay[]`, so every number can be checked against a hand-computed fixture.
 *
 * Two kinds of numbers come out of here, and the UI labels them differently:
 * - counted: entries, words, check-ins, mentions (what the user wrote or entered)
 * - derived: smoothed mood, correlations, TF-IDF terms, writing-style scores (computed from it)
 */
import { addDays, parseISODate } from "./dates";
import { nameKey } from "./names";
import type { AnalyticsDay } from "./schema";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
/** Fewer days than this and a mood comparison is flagged as a small sample. */
export const SMALL_SAMPLE = 5;

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
const round = (n: number, places = 2): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f + 0; // + 0 turns -0 into 0
};
/** Monday = 0 … Sunday = 6. */
const weekdayOf = (date: string) => (parseISODate(date).getDay() + 6) % 7;

/** A day's average valence over its check-ins, or null with none. */
export const dayValence = (d: AnalyticsDay): number | null => mean(d.moods.map((m) => m.valence));

// ---------------------------------------------------------------------------------------------
// Consistency

/** Longest run of consecutive entry days, and the run ending today (or yesterday if today is still blank). */
export function streaks(dates: string[], today: string): { current: number; longest: number } {
  const set = new Set(dates);
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  for (let d = set.has(today) ? today : addDays(today, -1); set.has(d); d = addDays(d, -1))
    current++;
  return { current, longest };
}

export interface MonthRow {
  /** `YYYY-MM` */
  month: string;
  entries: number;
  words: number;
}

/** Entries and words per month, every month from the first to the last (empty ones are zero). */
export function entriesPerMonth(days: AnalyticsDay[]): MonthRow[] {
  if (!days.length) return [];
  const by = new Map<string, MonthRow>();
  for (const d of days) {
    const m = d.date.slice(0, 7);
    const row = by.get(m) ?? { month: m, entries: 0, words: 0 };
    row.entries++;
    row.words += d.words;
    by.set(m, row);
  }
  const months = [...by.keys()].sort();
  const out: MonthRow[] = [];
  let [y, m] = months[0].split("-").map(Number);
  const [ly, lm] = months[months.length - 1].split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(by.get(key) ?? { month: key, entries: 0, words: 0 });
    if (++m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}

/** Words for each calendar day from `from` to `to` inclusive (0 for days without an entry). */
export function dailyWords(days: AnalyticsDay[], from: string, to: string) {
  const words = new Map(days.map((d) => [d.date, d.words]));
  const out: { date: string; words: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, words: words.get(d) ?? 0 });
  return out;
}

/**
 * When entries were started, by hour of the day, from each file's `created` time (as written,
 * in the local time of the writer). Files without one are counted in `missing`.
 */
export function timeOfDay(days: AnalyticsDay[]): {
  bins: number[];
  counted: number;
  missing: number;
} {
  const bins = new Array<number>(24).fill(0);
  let missing = 0;
  for (const d of days) {
    const m = d.created ? /T(\d{2}):/.exec(d.created) : null;
    if (m && Number(m[1]) < 24) bins[Number(m[1])]++;
    else missing++;
  }
  return { bins, counted: days.length - missing, missing };
}

export interface WeekdayRow {
  entries: number;
  /** Mean words over the days with an entry. */
  avgWords: number | null;
  avgValence: number | null;
}

export function weekdayPattern(days: AnalyticsDay[]): WeekdayRow[] {
  const groups: AnalyticsDay[][] = WEEKDAYS.map(() => []);
  for (const d of days) groups[weekdayOf(d.date)].push(d);
  return groups.map((g) => {
    const w = mean(g.map((d) => d.words));
    const v = mean(g.flatMap((d) => dayValence(d) ?? []));
    return {
      entries: g.length,
      avgWords: w === null ? null : round(w, 1),
      avgValence: v === null ? null : round(v),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Mood

export interface ValencePoint {
  date: string;
  /** The day's average. */
  valence: number;
  /** Trailing mean over the last `window` calendar days, over days that have a check-in. */
  smooth: number;
}

/** Valence per day with a trailing mean over `window` calendar days (derived; the raw value stays). */
export function valenceSeries(days: AnalyticsDay[], window = 7): ValencePoint[] {
  const pts = days.flatMap((d) => {
    const v = dayValence(d);
    return v === null ? [] : [{ date: d.date, valence: v }];
  });
  return pts.map((p, i) => {
    const from = addDays(p.date, -(window - 1));
    const inWindow: number[] = [];
    for (let j = i; j >= 0 && pts[j].date >= from; j--) inWindow.push(pts[j].valence);
    return { date: p.date, valence: round(p.valence), smooth: round(mean(inWindow) ?? p.valence) };
  });
}

export interface EmotionRow {
  emotion: string;
  /** Times chosen in a mood check-in (user-entered). */
  checkins: number;
  /** Times written inline as `!emotion` (user-entered, shown separately). */
  inline: number;
}

/** Check-ins and inline `!emotion` mentions are kept apart (master plan §1). */
export function emotionFrequency(days: AnalyticsDay[]): EmotionRow[] {
  const by = new Map<string, EmotionRow>();
  const row = (name: string) => {
    const k = nameKey(name);
    let r = by.get(k);
    if (!r) by.set(k, (r = { emotion: name, checkins: 0, inline: 0 }));
    return r;
  };
  for (const d of days) {
    for (const m of d.moods) for (const e of m.emotions) row(e).checkins++;
    for (const l of d.links) if (l.kind === "emotion") row(l.name).inline++;
  }
  return [...by.values()].sort(
    (a, b) => b.checkins + b.inline - (a.checkins + a.inline) || a.emotion.localeCompare(b.emotion),
  );
}

export const TIME_BUCKETS = ["Night", "Morning", "Afternoon", "Evening"] as const;
/** Hours: night 0–5, morning 6–11, afternoon 12–17, evening 18–23. */
export const bucketOfHour = (h: number) => Math.floor(h / 6);

/** Mean valence of check-ins by the time of day they were made. */
export function moodByTimeOfDay(days: AnalyticsDay[]) {
  const groups: number[][] = TIME_BUCKETS.map(() => []);
  for (const d of days)
    for (const m of d.moods) groups[bucketOfHour(Number(m.at.slice(0, 2)))].push(m.valence);
  return groups.map((g) => ({ checkins: g.length, avgValence: g.length ? round(mean(g)!) : null }));
}

export interface CorrelationRow {
  kind: "person" | "place" | "tag";
  name: string;
  /** Days with a check-in that have this item. */
  days: number;
  avgValence: number;
  /** Average with the item minus the baseline. */
  delta: number;
  /** Fewer than `SMALL_SAMPLE` days: show it, but flag it. */
  small: boolean;
}

/**
 * Average mood on days when a person, place or tag appears, against the baseline (the average
 * over every day with a check-in). This shows association, not cause.
 */
export function correlations(days: AnalyticsDay[]): {
  baseline: number | null;
  rows: CorrelationRow[];
  moodDays: number;
} {
  const moodDays = days.flatMap((d) => {
    const v = dayValence(d);
    return v === null ? [] : [{ d, v }];
  });
  const baseline = mean(moodDays.map((x) => x.v));
  if (baseline === null) return { baseline: null, rows: [], moodDays: 0 };
  const by = new Map<string, { kind: CorrelationRow["kind"]; name: string; vals: number[] }>();
  const add = (kind: CorrelationRow["kind"], name: string, v: number) => {
    const k = `${kind}:${nameKey(name)}`;
    const e = by.get(k) ?? { kind, name, vals: [] };
    e.vals.push(v);
    by.set(k, e);
  };
  for (const { d, v } of moodDays) {
    // Once per day each, however often it is mentioned.
    const seen = new Set<string>();
    for (const l of d.links) {
      if (l.kind !== "person" && l.kind !== "place") continue;
      const k = `${l.kind}:${nameKey(l.name)}`;
      if (!seen.has(k)) {
        seen.add(k);
        add(l.kind, l.name, v);
      }
    }
    for (const t of new Map(d.tags.map((t) => [nameKey(t), t])).values()) add("tag", t, v);
  }
  const rows = [...by.values()].map(({ kind, name, vals }): CorrelationRow => {
    const avg = mean(vals)!;
    return {
      kind,
      name,
      days: vals.length,
      avgValence: round(avg),
      delta: round(avg - baseline),
      small: vals.length < SMALL_SAMPLE,
    };
  });
  rows.sort(
    (a, b) =>
      Number(a.small) - Number(b.small) ||
      Math.abs(b.delta) - Math.abs(a.delta) ||
      a.name.localeCompare(b.name),
  );
  return { baseline: round(baseline), rows, moodDays: moodDays.length };
}

// ---------------------------------------------------------------------------------------------
// People & topics

export interface MentionRow {
  name: string;
  kind: string;
  mentions: number;
  /** Distinct days. */
  days: number;
  first: string;
  last: string;
  /** Mentions in the last `TREND_DAYS` days minus the `TREND_DAYS` before that. */
  trend: number;
}
export const TREND_DAYS = 90;

/** People (or places) ranked by mentions, with a recent trend. */
export function mostMentioned(
  days: AnalyticsDay[],
  kind: "person" | "place",
  today: string,
): MentionRow[] {
  const recentFrom = addDays(today, -(TREND_DAYS - 1));
  const priorFrom = addDays(today, -(2 * TREND_DAYS - 1));
  const by = new Map<string, MentionRow & { dayset: Set<string> }>();
  for (const d of days) {
    for (const l of d.links) {
      if (l.kind !== kind) continue;
      const k = nameKey(l.name);
      const r = by.get(k) ?? {
        name: l.name,
        kind,
        mentions: 0,
        days: 0,
        first: d.date,
        last: d.date,
        trend: 0,
        dayset: new Set<string>(),
      };
      r.mentions++;
      r.dayset.add(d.date);
      if (d.date < r.first) r.first = d.date;
      if (d.date > r.last) r.last = d.date;
      if (d.date >= recentFrom && d.date <= today) r.trend++;
      else if (d.date >= priorFrom && d.date < recentFrom) r.trend--;
      by.set(k, r);
    }
  }
  return [...by.values()]
    .map(({ dayset, ...r }) => ({ ...r, days: dayset.size }))
    .sort((a, b) => b.mentions - a.mentions || b.days - a.days || a.name.localeCompare(b.name));
}

/** Days a person or place is mentioned per month (zero-filled between the first and last). */
export function mentionsOverTime(
  days: AnalyticsDay[],
  name: string,
): { month: string; days: number }[] {
  const key = nameKey(name);
  const mine = days.filter((d) => d.links.some((l) => nameKey(l.name) === key));
  return entriesPerMonth(mine).map((m) => ({ month: m.month, days: m.entries }));
}

/** Average mood on the days a person appears, against the baseline (see `correlations`). */
export function moodWith(days: AnalyticsDay[], name: string) {
  const key = nameKey(name);
  const rows = correlations(days);
  return rows.rows.find((r) => r.kind !== "tag" && nameKey(r.name) === key) ?? null;
}

export interface PairRow {
  a: string;
  b: string;
  /** Days both appear. */
  days: number;
}

/** Who appears on the same day, most often first. People only. */
export function coOccurrence(days: AnalyticsDay[], limit = 12): PairRow[] {
  const by = new Map<string, PairRow>();
  for (const d of days) {
    const people = [
      ...new Map(
        d.links.filter((l) => l.kind === "person").map((l) => [nameKey(l.name), l.name]),
      ).values(),
    ].sort();
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const k = `${people[i]}\n${people[j]}`;
        const r = by.get(k) ?? { a: people[i], b: people[j], days: 0 };
        r.days++;
        by.set(k, r);
      }
    }
  }
  return [...by.values()]
    .sort((x, y) => y.days - x.days || x.a.localeCompare(y.a) || x.b.localeCompare(y.b))
    .slice(0, limit);
}

export function tagFrequency(days: AnalyticsDay[]): { tag: string; entries: number }[] {
  const by = new Map<string, { tag: string; entries: number }>();
  for (const d of days) {
    for (const t of new Set(d.tags.map(nameKey))) {
      const r = by.get(t) ?? { tag: d.tags.find((x) => nameKey(x) === t)!, entries: 0 };
      r.entries++;
      by.set(t, r);
    }
  }
  return [...by.values()].sort((a, b) => b.entries - a.entries || a.tag.localeCompare(b.tag));
}

// ---------------------------------------------------------------------------------------------
// Text

const STOPWORDS = new Set(
  `a about above after again all also am an and any are aren't as at back be because been before being below between both but by can can't could couldn't day did didn't do does doesn't doing don't down during each even ever every few for from further get got had hadn't has hasn't have haven't having he her here hers herself him himself his how i i'd i'll i'm i've if in into is isn't it it's its itself just know like little made make many me more most much my myself no nor not now of off on once one only or other our ours ourselves out over own really same she should shouldn't so some still such take than that the their theirs them themselves then there these they this those through time to today too under until up us very was wasn't we we'd we'll we're we've well went were weren't what when where which while who whom why will with won't would wouldn't yes yesterday you you'd you'll you're you've your yours yourself yourselves`.split(
    /\s+/,
  ),
);

/** The prose of an entry: markup, links, code, tags and URLs removed. */
export function plainText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(
      /!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g,
      (_m, target: string, label?: string) => label ?? target,
    )
    .replace(/(^|\s)#[\p{L}\p{N}_/-]+/gu, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_~]+/g, "");
}

const wordsOf = (text: string): string[] =>
  (text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) ?? []).map((w) =>
    w.replace(/’/g, "'"),
  );

export interface TermRow {
  month: string;
  terms: { term: string; score: number }[];
}

/**
 * Keyword-derived top terms per month, by TF-IDF with each month as a document (smoothed idf).
 * These are keywords, not topics; AI topic modelling comes later and is labelled as such.
 */
export function topTermsByMonth(days: AnalyticsDay[], perMonth = 5): TermRow[] {
  const docs = new Map<string, Map<string, number>>();
  for (const d of days) {
    const m = d.date.slice(0, 7);
    const tf = docs.get(m) ?? new Map<string, number>();
    for (const w of wordsOf(plainText(d.body))) {
      if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      tf.set(w, (tf.get(w) ?? 0) + 1);
    }
    docs.set(m, tf);
  }
  const n = docs.size;
  const df = new Map<string, number>();
  for (const tf of docs.values()) for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  return [...docs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, tf]) => {
      const total = [...tf.values()].reduce((s, x) => s + x, 0) || 1;
      const terms = [...tf.entries()]
        .map(([term, c]) => ({
          term,
          score: round((c / total) * (Math.log((n + 1) / ((df.get(term) ?? 0) + 1)) + 1), 4),
        }))
        .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term))
        .slice(0, perMonth);
      return { month, terms };
    });
}

// ---------------------------------------------------------------------------------------------
// Writing style (local, deterministic; every score is approximate and labelled so)

const SINGULAR = new Set(["i", "me", "my", "mine", "myself", "i'm", "i've", "i'll", "i'd"]);
const PLURAL = new Set(["we", "us", "our", "ours", "ourselves", "we're", "we've", "we'll", "we'd"]);
const PAST = new Set(
  "was were had did went saw got made took felt said came ate ran thought knew gave found told left met began kept sat stood heard wrote read bought brought slept woke lost won".split(
    " ",
  ),
);
const PRESENT = new Set(
  "is am are has have do does feel feels know knows think thinks want wants need needs i'm it's".split(
    " ",
  ),
);
const FUTURE = new Set(["will", "shall", "gonna", "i'll", "we'll", "won't"]);
const POSITIVE = new Set(
  "good great happy love loved lovely enjoy enjoyed nice wonderful amazing grateful thankful glad proud calm peaceful fun excited hopeful relaxed beautiful best better laugh laughed smile smiled warm kind lucky joy fine easy win safe".split(
    " ",
  ),
);
const NEGATIVE = new Set(
  "bad sad angry hate hated awful terrible tired exhausted anxious worried stress stressed stressful lonely upset annoyed frustrated hard difficult worst worse cry cried pain hurt sick afraid scared fear guilty ashamed fail failed lost miss missed dread boring".split(
    " ",
  ),
);

/** Vowel-group syllable count (an approximation; English only). */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

export interface StyleStats {
  words: number;
  sentences: number;
  uniqueWords: number;
  /** Guiraud's root type-token ratio, `unique / √words`: steadier than TTR across lengths. */
  richness: number | null;
  avgSentenceLength: number | null;
  /** Flesch–Kincaid grade level. */
  gradeLevel: number | null;
  /** Share of first-person words that are singular (I, me, my) rather than plural (we, us, our). */
  singularShare: number | null;
  singular: number;
  plural: number;
  /** Rough tense markers as shares of all markers found. */
  tense: { past: number; present: number; future: number } | null;
  /** Sentences ending in `?` and in `!` as a share of all sentences. */
  questionRate: number | null;
  exclamationRate: number | null;
  /** (positive − negative) / (positive + negative) over a small word list, −1 … 1. */
  sentiment: number | null;
  longest: { date: string; words: number } | null;
  shortest: { date: string; words: number } | null;
}

export function writingStyle(days: AnalyticsDay[]): StyleStats {
  let words = 0;
  let sentences = 0;
  let syl = 0;
  let q = 0;
  let ex = 0;
  let sing = 0;
  let plur = 0;
  let past = 0;
  let pres = 0;
  let fut = 0;
  let pos = 0;
  let neg = 0;
  const types = new Set<string>();
  for (const d of days) {
    const text = plainText(d.body);
    for (const s of text.split(/(?<=[.!?…])\s+|\n+/)) {
      const ws = wordsOf(s);
      if (!ws.length) continue;
      sentences++;
      if (/\?["')\]]*\s*$/.test(s)) q++;
      if (/!["')\]]*\s*$/.test(s)) ex++;
      for (const w of ws) {
        words++;
        syl += syllables(w);
        types.add(w);
        if (SINGULAR.has(w)) sing++;
        if (PLURAL.has(w)) plur++;
        if (PAST.has(w) || (w.length > 4 && w.endsWith("ed"))) past++;
        if (PRESENT.has(w)) pres++;
        if (FUTURE.has(w)) fut++;
        if (POSITIVE.has(w)) pos++;
        if (NEGATIVE.has(w)) neg++;
      }
    }
  }
  const withText = days.filter((d) => d.words > 0);
  const byWords = [...withText].sort((a, b) => b.words - a.words || a.date.localeCompare(b.date));
  const pick = (d?: AnalyticsDay) => (d ? { date: d.date, words: d.words } : null);
  const marks = past + pres + fut;
  return {
    words,
    sentences,
    uniqueWords: types.size,
    richness: words ? round(types.size / Math.sqrt(words)) : null,
    avgSentenceLength: sentences ? round(words / sentences, 1) : null,
    gradeLevel:
      words && sentences
        ? round(0.39 * (words / sentences) + 11.8 * (syl / words) - 15.59, 1)
        : null,
    singular: sing,
    plural: plur,
    singularShare: sing + plur ? round(sing / (sing + plur)) : null,
    tense: marks
      ? { past: round(past / marks), present: round(pres / marks), future: round(fut / marks) }
      : null,
    questionRate: sentences ? round(q / sentences) : null,
    exclamationRate: sentences ? round(ex / sentences) : null,
    sentiment: pos + neg ? round((pos - neg) / (pos + neg)) : null,
    longest: pick(byWords[0]),
    shortest: pick(byWords[byWords.length - 1]),
  };
}

// ---------------------------------------------------------------------------------------------

export interface Analysis {
  entries: number;
  words: number;
  firstDate: string | null;
  streak: { current: number; longest: number };
  months: MonthRow[];
  timeOfDay: ReturnType<typeof timeOfDay>;
  weekdays: WeekdayRow[];
  valence: ValencePoint[];
  emotions: EmotionRow[];
  moodByTime: ReturnType<typeof moodByTimeOfDay>;
  correlations: ReturnType<typeof correlations>;
  people: MentionRow[];
  places: MentionRow[];
  pairs: PairRow[];
  tags: ReturnType<typeof tagFrequency>;
  terms: TermRow[];
  style: StyleStats;
}

/** Everything the dashboard shows, in one pass over the days. */
export function analyze(days: AnalyticsDay[], today: string): Analysis {
  return {
    entries: days.length,
    words: days.reduce((s, d) => s + d.words, 0),
    firstDate: days[0]?.date ?? null,
    streak: streaks(
      days.map((d) => d.date),
      today,
    ),
    months: entriesPerMonth(days),
    timeOfDay: timeOfDay(days),
    weekdays: weekdayPattern(days),
    valence: valenceSeries(days),
    emotions: emotionFrequency(days),
    moodByTime: moodByTimeOfDay(days),
    correlations: correlations(days),
    people: mostMentioned(days, "person", today),
    places: mostMentioned(days, "place", today),
    pairs: coOccurrence(days),
    tags: tagFrequency(days),
    terms: topTermsByMonth(days),
    style: writingStyle(days),
  };
}
