/**
 * What each quick-command trigger offers. Pure functions of the query and the vault's entities,
 * so they can be tested without an editor. The editor wiring is in `triggers.ts`.
 *
 *   @  people and places (type icon beside each), "create new" inline
 *   !  emotions, rendered as chips
 *   #  topic tags, "create new" inline
 *   $  dates ("next friday"), creating an event link
 */
import { formatShort, parseDateInput, parseISODate } from "@/lib/dates";
import { nameKey, tidyName } from "@/lib/names";
import type { EntityKind, EntitySummary, TagInfo } from "@/lib/schema";

export type SuggestIcon = "person" | "place" | "emotion" | "tag" | "date" | "create";

/** What goes into the note when an item is picked. */
export type Insert =
  | { type: "link"; target: string; label: string | null }
  | { type: "text"; text: string };

export interface SuggestItem {
  id: string;
  icon: SuggestIcon;
  label: string;
  detail?: string;
  /** When set, this note is created first and the link points at the result. */
  create?: { kind: EntityKind; name: string };
  insert: Insert;
}

export interface TriggerData {
  entities: EntitySummary[];
  tags: TagInfo[];
  today: string;
}

export type TriggerChar = "@" | "!" | "#" | "$";

/** Triggers whose query may contain spaces ("Alice Smith", "next friday"). */
export const ALLOWS_SPACES: Record<TriggerChar, boolean> = {
  "@": true,
  "!": false,
  "#": false,
  $: true,
};

const MAX_ITEMS = 8;
const MAX_QUERY_CHARS = 40;

/** A link to an entity: the unique filename, with the display name as label when they differ. */
export const linkTo = (e: EntitySummary): Insert => ({
  type: "link",
  target: e.name,
  label: e.display !== e.name ? e.display : null,
});

/** 0 = exact, 1 = starts with, 2 = a word starts with, 3 = contains; null = no match. */
export function matchRank(names: string[], query: string): number | null {
  const q = nameKey(query);
  if (!q) return 0;
  let best: number | null = null;
  for (const n of names.map(nameKey)) {
    let r: number | null = null;
    if (n === q) r = 0;
    else if (n.startsWith(q)) r = 1;
    else if (n.split(/[\s\-_/]+/).some((w) => w.startsWith(q))) r = 2;
    else if (n.includes(q)) r = 3;
    if (r !== null && (best === null || r < best)) best = r;
  }
  return best;
}

const namesOf = (e: EntitySummary) => [e.display, e.name, ...e.aliases];

/** Better match first, then most recently and most often mentioned. */
function ranked(entities: EntitySummary[], query: string): EntitySummary[] {
  return entities
    .map((e) => ({ e, rank: matchRank(namesOf(e), query) }))
    .filter((x): x is { e: EntitySummary; rank: number } => x.rank !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (b.e.lastMention ?? "").localeCompare(a.e.lastMention ?? "") ||
        b.e.mentions - a.e.mentions ||
        nameKey(a.e.display).localeCompare(nameKey(b.e.display)),
    )
    .map((x) => x.e);
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** "Alice Smith" can be a name; "Alice went to the shop" is a sentence the user is still typing. */
const looksLikeName = (q: string) =>
  wordCount(q) <= 3 &&
  q
    .trim()
    .split(/\s+/)
    .every((w) => /^\p{Lu}/u.test(w) || wordCount(q) === 1);

export function mentionItems(query: string, data: TriggerData): SuggestItem[] {
  if (query.length > MAX_QUERY_CHARS || /^\s/.test(query)) return [];
  const pool = data.entities.filter((e) => e.kind === "person" || e.kind === "place");
  const items: SuggestItem[] = ranked(pool, query)
    .slice(0, MAX_ITEMS)
    .map((e) => ({
      id: e.path,
      icon: e.kind as SuggestIcon,
      label: e.display,
      insert: linkTo(e),
    }));
  const q = query.trim();
  if (q && looksLikeName(q)) {
    for (const kind of ["person", "place"] as const) {
      const taken = pool.some((e) => e.kind === kind && matchRank(namesOf(e), q) === 0);
      if (!taken) {
        const name = tidyName(kind, q);
        items.push({
          id: `create-${kind}`,
          icon: "create",
          label: `Create ${kind} “${name}”`,
          create: { kind, name },
          insert: { type: "link", target: q, label: null },
        });
      }
    }
  }
  return items;
}

export function emotionItems(query: string, data: TriggerData): SuggestItem[] {
  if (query.length > MAX_QUERY_CHARS) return [];
  const pool = data.entities.filter((e) => e.kind === "emotion");
  return ranked(pool, query)
    .slice(0, 10)
    .map((e) => ({ id: e.path, icon: "emotion", label: e.display, insert: linkTo(e) }));
}

const TAG_CHARS = /^[\p{L}\p{N}_/-]+$/u;

export function tagItems(query: string, data: TriggerData): SuggestItem[] {
  const q = query.replace(/^#/, "");
  if (q.length > MAX_QUERY_CHARS) return [];
  const items: SuggestItem[] = data.tags
    .filter((t) => matchRank([t.tag], q) !== null)
    .sort(
      (a, b) => (matchRank([a.tag], q) ?? 9) - (matchRank([b.tag], q) ?? 9) || b.count - a.count,
    )
    .slice(0, MAX_ITEMS)
    .map((t) => ({
      id: `tag-${t.tag}`,
      icon: "tag" as const,
      label: `#${t.tag}`,
      detail: t.count ? `${t.count}×` : undefined,
      insert: { type: "text" as const, text: `#${t.tag}` },
    }));
  const exact = data.tags.some((t) => nameKey(t.tag) === nameKey(q));
  if (q && !exact && TAG_CHARS.test(q) && /\D/.test(q)) {
    items.push({
      id: "create-tag",
      icon: "create",
      label: `Create tag #${q}`,
      create: { kind: "tag", name: q },
      insert: { type: "text", text: `#${q}` },
    });
  }
  return items;
}

/** "Fri, Nov 6", with the year only when it isn't this one. */
export function dateLabel(iso: string, today: string): string {
  const d = parseISODate(iso);
  const sameYear = d.getFullYear() === parseISODate(today).getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function dateItems(query: string, data: TriggerData): SuggestItem[] {
  if (query.length > 24) return [];
  const q = query.trim();
  const candidates = q ? [q] : ["tomorrow", "next friday", "in a week"];
  const seen = new Set<string>();
  const items: SuggestItem[] = [];
  for (const c of candidates) {
    const date = parseDateInput(c, data.today);
    if (!date || seen.has(date)) continue;
    seen.add(date);
    const label = dateLabel(date, data.today);
    items.push({
      id: `date-${date}`,
      icon: "date",
      label: formatShort(date),
      detail: q ? undefined : c,
      insert: { type: "link", target: date, label },
    });
  }
  return items;
}

export function itemsFor(trigger: TriggerChar, query: string, data: TriggerData): SuggestItem[] {
  switch (trigger) {
    case "@":
      return mentionItems(query, data);
    case "!":
      return emotionItems(query, data);
    case "#":
      return tagItems(query, data);
    case "$":
      return dateItems(query, data);
  }
}
