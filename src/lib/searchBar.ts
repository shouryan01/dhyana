/**
 * The search bar's language. One line of text becomes a query for the core:
 *
 *   walk river @Alex #outdoors !calm in:last-month mood:>0.2
 *
 * - plain words: full text (all must appear)
 * - `@Name` / `person:Name` / `place:Name`: people and places (aliases work; quote names with
 *   spaces: `@"Mary Ann"`)
 * - `#tag` / `tag:x`, `!emotion` / `emotion:x`
 * - `from:2026-01-01`, `to:2026-03-31`, `on:2026-03-02`
 * - `in:2026`, `in:2026-03`, `in:this-month`, `in:last-month`, `in:this-year`, `in:last-year`
 * - `last:30d` (also `w`, `m`, `y`): the most recent stretch up to today
 * - `mood:>0.2`, `mood:<-0.2`, `mood:-0.5..0.5`, `mood:positive|negative|neutral`
 */
import { addDays, isISODate, toISODate } from "./dates";
import { nameKey } from "./names";
import type { EntitySummary, SearchQuery } from "./schema";

export const EMPTY_QUERY: SearchQuery = {
  text: "",
  people: [],
  tags: [],
  emotions: [],
  from: null,
  to: null,
  moodMin: null,
  moodMax: null,
};

export interface ParsedBar {
  query: SearchQuery;
  /** Names or values the bar mentions that matched nothing, so the UI can say so. */
  problems: string[];
  /** A date, period or mood value could not be read, so the search should return nothing rather than ignore it. */
  invalid: boolean;
  /** True when there is nothing to search for. */
  empty: boolean;
}

const TOKEN = /(?:[^\s"]*:)?[@#!]?"[^"]*"|\S+/g;
const unquote = (s: string) => s.replace(/^"|"$/g, "");

const lastDayOfMonth = (year: number, month: number) => toISODate(new Date(year, month, 0));

/** `in:` values as an inclusive date range, or null if unrecognised. */
export function periodRange(value: string, today: string): [string, string] | null {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const v = value.toLowerCase();
  const month = (yy: number, mm: number): [string, string] => [
    `${yy}-${String(mm).padStart(2, "0")}-01`,
    lastDayOfMonth(yy, mm),
  ];
  if (v === "this-month") return month(y, m);
  if (v === "last-month") return m === 1 ? month(y - 1, 12) : month(y, m - 1);
  if (v === "this-year") return [`${y}-01-01`, `${y}-12-31`];
  if (v === "last-year") return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  if (/^\d{4}$/.test(v)) return [`${v}-01-01`, `${v}-12-31`];
  const ym = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(v);
  if (ym) return month(Number(ym[1]), Number(ym[2]));
  return null;
}

/** `last:30d` and friends: from that many days back to today. */
function recent(value: string, today: string): [string, string] | null {
  const m = /^(\d{1,4})([dwmy])$/i.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (n === 0) return null;
  const t = new Date(`${today}T00:00:00`);
  if (unit === "d") return [addDays(today, -(n - 1)), today];
  if (unit === "w") return [addDays(today, -(7 * n - 1)), today];
  if (unit === "m") t.setMonth(t.getMonth() - n);
  else t.setFullYear(t.getFullYear() - n);
  return [addDays(toISODate(t), 1), today];
}

function moodRange(value: string): [number | null, number | null] | null {
  const v = value.toLowerCase();
  if (v === "positive") return [0.15, null];
  if (v === "negative") return [null, -0.15];
  if (v === "neutral") return [-0.15, 0.15];
  const num = (s: string) => (s !== "" && Number.isFinite(Number(s)) ? Number(s) : undefined);
  let r: RegExpExecArray | null;
  if ((r = /^>=?(.+)$/.exec(v))) {
    const n = num(r[1]);
    return n === undefined ? null : [n, null];
  }
  if ((r = /^<=?(.+)$/.exec(v))) {
    const n = num(r[1]);
    return n === undefined ? null : [null, n];
  }
  if ((r = /^(-?[\d.]+)\.\.(-?[\d.]+)$/.exec(v))) {
    const [a, b] = [num(r[1]), num(r[2])];
    return a === undefined || b === undefined ? null : [Math.min(a, b), Math.max(a, b)];
  }
  return null;
}

type Entity = Pick<EntitySummary, "kind" | "name" | "aliases" | "title">;

/** The note a typed name means: exact filename, then alias, then title (never a guess). */
function resolve(name: string, entities: Entity[], kinds: string[]): string | null {
  const key = nameKey(name);
  const pool = entities.filter((e) => kinds.includes(e.kind));
  return (
    pool.find((e) => nameKey(e.name) === key)?.name ??
    pool.find((e) => e.aliases.some((a) => nameKey(a) === key))?.name ??
    pool.find((e) => e.title && nameKey(e.title) === key)?.name ??
    null
  );
}

const PERSON_PLACE = ["person", "place"];

export function parseBar(bar: string, entities: Entity[], today: string): ParsedBar {
  const q: SearchQuery = { ...EMPTY_QUERY, people: [], tags: [], emotions: [] };
  const problems: string[] = [];
  let invalid = false;
  const text: string[] = [];

  const setRange = (r: [string, string] | null, raw: string) => {
    if (!r) {
      invalid = true;
      return void problems.push(raw);
    }
    q.from = r[0];
    q.to = r[1];
  };

  for (const raw of bar.match(TOKEN) ?? []) {
    const colon = raw.indexOf(":");
    const key =
      colon > 0 && /^[a-z]+$/i.test(raw.slice(0, colon)) ? raw.slice(0, colon).toLowerCase() : "";
    const value = unquote(key ? raw.slice(colon + 1) : raw);

    if (key === "from" || key === "to" || key === "on") {
      if (!isISODate(value)) {
        invalid = true;
        problems.push(raw);
        continue;
      }
      if (key !== "to") q.from = value;
      if (key !== "from") q.to = value;
    } else if (key === "in") {
      setRange(periodRange(value, today), raw);
    } else if (key === "last") {
      setRange(recent(value, today), raw);
    } else if (key === "mood") {
      const r = moodRange(value);
      if (r) [q.moodMin, q.moodMax] = r;
      else {
        invalid = true;
        problems.push(raw);
      }
    } else if (key === "person" || key === "place" || raw.startsWith("@")) {
      const name = key ? value : unquote(raw.slice(1));
      if (!name) continue;
      const hit = resolve(name, entities, PERSON_PLACE);
      // An unknown name stays in the filter, so it matches nothing instead of everything.
      q.people.push(hit ?? name);
      if (!hit) problems.push(`@${name}`);
    } else if (key === "tag" || (raw.startsWith("#") && raw.length > 1)) {
      const name = key ? value : unquote(raw.slice(1));
      if (name) q.tags.push(name);
    } else if (key === "emotion" || (raw.startsWith("!") && raw.length > 1)) {
      const name = key ? value : unquote(raw.slice(1));
      if (!name) continue;
      const hit = resolve(name, entities, ["emotion"]);
      q.emotions.push(hit ?? name);
      if (!hit) problems.push(`!${name}`);
    } else {
      text.push(unquote(raw));
    }
  }
  q.text = text.join(" ");
  const empty =
    !q.text.trim() &&
    !q.people.length &&
    !q.tags.length &&
    !q.emotions.length &&
    q.from === null &&
    q.to === null &&
    q.moodMin === null &&
    q.moodMax === null;
  return { query: q, problems, invalid, empty };
}

/** Matched words in a snippet sit between these (see `search.rs`). */
export function snippetParts(snippet: string): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  let hit = false;
  let cur = "";
  for (const ch of snippet) {
    if (ch === "\u0001" || ch === "\u0002") {
      if (cur) parts.push({ text: cur, hit });
      cur = "";
      hit = ch === "\u0001";
    } else cur += ch;
  }
  if (cur) parts.push({ text: cur, hit });
  return parts;
}
