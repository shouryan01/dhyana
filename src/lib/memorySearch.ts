/**
 * Search and analytics reads for the in-memory backend: a small twin of `src-tauri/src/search.rs`
 * (same filters, same per-day records), so `pnpm dev` and the unit tests behave like the app.
 * The real core uses SQLite FTS5 with stemming; this one matches words by prefix.
 */
import { scanLinks } from "@/markdown/links";
import { nameKey } from "./names";
import type { AnalyticsDay, CheckIn, EntitySummary, SearchHit, SearchQuery } from "./schema";
import { countWords } from "./words";

export interface MemDay {
  body: string;
  created?: string | null;
  mood?: CheckIn[];
}

const KINDS = new Set(["person", "place", "emotion"]);

export function buildAnalyticsDays(
  files: Record<string, MemDay>,
  entities: Pick<EntitySummary, "kind" | "name" | "aliases">[],
): AnalyticsDay[] {
  const byKey = new Map<string, { kind: string; name: string }>();
  for (const e of entities) {
    if (!KINDS.has(e.kind)) continue;
    for (const k of [e.name, ...e.aliases]) if (!byKey.has(nameKey(k))) byKey.set(nameKey(k), e);
  }
  return Object.keys(files)
    .sort()
    .map((date) => {
      const f = files[date];
      const scan = scanLinks(f.body);
      return {
        date,
        words: countWords(f.body),
        created: f.created ?? null,
        body: f.body,
        moods: f.mood ?? [],
        tags: scan.tags,
        links: scan.links.flatMap((l) => {
          const hit = byKey.get(nameKey(l.target));
          return hit ? [{ name: hit.name, kind: hit.kind }] : [];
        }),
      };
    });
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Marks matched words the way the core does (U+0001 … U+0002). */
function snippetOf(body: string, words: string[]): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!words.length) return flat.slice(0, 240);
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${words.map(escape).join("|")})`, "giu");
  const first = flat.search(re);
  const start = Math.max(0, first - 60);
  const piece = flat.slice(start, start + 200);
  return (
    (start > 0 ? "…" : "") +
    piece.replace(re, (_m, pre: string, w: string) => `${pre}\u0001${w}\u0002`) +
    (start + 200 < flat.length ? "…" : "")
  );
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function searchDays(days: AnalyticsDay[], q: SearchQuery, limit = 200): SearchHit[] {
  const words: string[] = q.text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const last = words.length - 1;
  const textMatches = (body: string) => {
    if (!words.length) return true;
    const tokens: string[] = body.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    // The last word is a prefix (search as you type); the others are whole words.
    return words.every((w, i) =>
      i === last ? tokens.some((t) => t.startsWith(w)) : tokens.includes(w),
    );
  };
  const hits: SearchHit[] = [];
  for (const d of [...days].sort((a, b) => b.date.localeCompare(a.date))) {
    if (q.from && d.date < q.from) continue;
    if (q.to && d.date > q.to) continue;
    const linked = new Set(d.links.map((l) => nameKey(l.name)));
    if (!q.people.every((p) => linked.has(nameKey(p)))) continue;
    const tags = new Set(d.tags.map(nameKey));
    if (!q.tags.every((t) => tags.has(nameKey(t)))) continue;
    const emotions = new Set([...d.moods.flatMap((m) => m.emotions.map(nameKey)), ...linked]);
    if (!q.emotions.every((e) => emotions.has(nameKey(e)))) continue;
    const valence = avg(d.moods.map((m) => m.valence));
    if (q.moodMin !== null && (valence === null || valence < q.moodMin)) continue;
    if (q.moodMax !== null && (valence === null || valence > q.moodMax)) continue;
    if (!textMatches(d.body)) continue;
    hits.push({
      date: d.date,
      words: d.words,
      valence: valence === null ? null : Math.round(valence * 100) / 100,
      snippet: snippetOf(d.body, words),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
