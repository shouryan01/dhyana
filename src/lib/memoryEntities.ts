/**
 * Entity half of the in-memory backend: a faithful, small twin of the Rust `entities` and
 * `index` modules, so the UI behaves the same in `pnpm dev` and in unit tests. Everything is
 * derived on demand from the stored notes, like the real index.
 */
import { isISODate } from "./dates";
import { disambiguated, fileStem, nameKey } from "./names";
import {
  EntityPatchSchema,
  SEEDED_EMOTIONS,
  type EntityDetail,
  type EntityKind,
  type EntityPatch,
  type EntitySummary,
  type Mention,
  type RenameResult,
  type TagInfo,
  type UpcomingEvent,
} from "./schema";
import { rewriteLinks, scanLinks } from "@/markdown/links";

export interface MemEntity {
  kind: EntityKind;
  /** Filename stem, which is what links point at. */
  name: string;
  title?: string;
  aliases: string[];
  relationship?: string;
  birthday?: string;
  notes: string;
}

/** The stored day notes, as the entity store needs to see them. */
export interface DayStore {
  dates(): string[];
  body(date: string): string;
  setBody(date: string, body: string): void;
}

const DIRS: Record<EntityKind, string> = {
  person: "people",
  place: "places",
  emotion: "emotions",
  tag: "tags",
  note: "notes",
};
const pathOf = (kind: EntityKind, name: string) => `${DIRS[kind]}/${name}.md`;
const journalPath = (date: string) => `journal/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.md`;
const display = (e: MemEntity) => e.title ?? e.name;
const MENTION_LIMIT = 200;

interface LinkRow {
  src: { path: string; kind: string; name: string };
  key: string;
  label: string | null;
  context: string;
}

export function seedEntities(): Record<string, MemEntity> {
  const out: Record<string, MemEntity> = {};
  for (const name of SEEDED_EMOTIONS) {
    out[pathOf("emotion", name)] = { kind: "emotion", name, aliases: [], notes: "" };
  }
  return out;
}

export function createEntityStore(
  days: DayStore,
  initial: Record<string, MemEntity>,
  persist: (all: Record<string, MemEntity>) => void,
) {
  const ents = initial;
  const save = () => persist(ents);
  const fail = (msg: string): never => {
    throw new Error(msg);
  };

  const rows = (): [string, MemEntity][] => Object.entries(ents);
  const byNameKey = (key: string) => rows().filter(([, e]) => nameKey(e.name) === key);

  const links = (): LinkRow[] => {
    const out: LinkRow[] = [];
    for (const d of days.dates()) {
      for (const l of scanLinks(days.body(d)).links) {
        out.push({
          src: { path: journalPath(d), kind: "journal", name: d },
          key: nameKey(l.target),
          label: l.label,
          context: l.context,
        });
      }
    }
    for (const [path, e] of rows()) {
      for (const l of scanLinks(e.notes).links) {
        out.push({
          src: { path, kind: e.kind, name: e.name },
          key: nameKey(l.target),
          label: l.label,
          context: l.context,
        });
      }
    }
    return out;
  };

  /** Keys that resolve to an entity: its filename, then aliases no other filename claims. */
  const linkKeys = (e: MemEntity): string[] => {
    const own = nameKey(e.name);
    const keys = [own];
    for (const a of e.aliases) {
      const k = nameKey(a);
      if (!keys.includes(k) && byNameKey(k).length === 0) keys.push(k);
    }
    return keys;
  };

  const summarize = (path: string, e: MemEntity, all: LinkRow[]): EntitySummary => {
    const keys = new Set([nameKey(e.name), ...e.aliases.map(nameKey)]);
    let mentions = 0;
    let last: string | null = null;
    for (const l of all) {
      if (!keys.has(l.key) || l.key === nameKey(l.src.name)) continue;
      mentions++;
      if (l.src.kind === "journal" && (last === null || l.src.name > last)) last = l.src.name;
    }
    return {
      path,
      kind: e.kind,
      name: e.name,
      title: e.title ?? null,
      display: display(e),
      aliases: [...e.aliases],
      mentions,
      lastMention: last,
    };
  };

  const entityAt = (path: string): MemEntity =>
    ents[path] ?? fail(`not an editable entity: ${path}`);

  const sameKindWithKey = (kind: EntityKind, key: string): string | null => {
    for (const [p, e] of rows()) {
      if (e.kind !== kind) continue;
      if (
        nameKey(e.name) === key ||
        (e.title && nameKey(e.title) === key) ||
        e.aliases.some((a) => nameKey(a) === key)
      )
        return p;
    }
    return null;
  };

  const aliasOwner = (key: string, except: string): [string, string] | null => {
    for (const [p, e] of rows()) {
      if (p !== except && e.aliases.some((a) => nameKey(a) === key)) return [p, display(e)];
    }
    return null;
  };

  const detail = (path: string): EntityDetail => {
    const e = entityAt(path);
    const all = links();
    const keys = new Set(linkKeys(e));
    const backlinks: Mention[] = all
      .filter((l) => keys.has(l.key) && l.src.path !== path)
      .sort((a, b) => {
        const aj = a.src.kind === "journal" ? 1 : 0;
        const bj = b.src.kind === "journal" ? 1 : 0;
        return bj - aj || (a.src.name < b.src.name ? 1 : a.src.name > b.src.name ? -1 : 0);
      })
      .slice(0, MENTION_LIMIT)
      .map((l) => ({
        path: l.src.path,
        kind: l.src.kind,
        name: l.src.name,
        date: l.src.kind === "journal" ? l.src.name : null,
        context: l.context,
      }));
    return {
      ...summarize(path, e, all),
      relationship: e.relationship ?? null,
      birthday: e.birthday ?? null,
      notes: e.notes,
      backlinks,
    };
  };

  return {
    list(): EntitySummary[] {
      const all = links();
      return rows()
        .filter(([, e]) => e.kind !== "tag")
        .sort(
          ([pa, a], [pb, b]) =>
            a.kind.localeCompare(b.kind) ||
            nameKey(a.name).localeCompare(nameKey(b.name)) ||
            pa.localeCompare(pb),
        )
        .map(([p, e]) => summarize(p, e, all));
    },

    tags(): TagInfo[] {
      const byKey = new Map<string, TagInfo>();
      for (const d of days.dates()) {
        for (const tag of scanLinks(days.body(d)).tags) {
          const k = nameKey(tag);
          const cur = byKey.get(k);
          if (cur) cur.count++;
          else byKey.set(k, { tag, count: 1 });
        }
      }
      for (const [, e] of rows()) {
        if (e.kind === "tag" && !byKey.has(nameKey(display(e))))
          byKey.set(nameKey(display(e)), { tag: display(e), count: 0 });
      }
      return [...byKey.values()].sort(
        (a, b) => b.count - a.count || nameKey(a.tag).localeCompare(nameKey(b.tag)),
      );
    },

    get: detail,

    create(kind: EntityKind, rawName: string): EntitySummary {
      const name = rawName.trim();
      const s = fileStem(name);
      if (!s.ok) return fail(s.error);
      for (const k of [nameKey(name), nameKey(s.stem)]) {
        const hit = sameKindWithKey(kind, k);
        if (hit) fail(`"${name}" already exists (${hit})`);
      }
      let file = s.stem;
      if (byNameKey(nameKey(file)).length) {
        file = disambiguated(s.stem, kind);
        const hit = byNameKey(nameKey(file))[0];
        if (hit) fail(`"${name}" already exists (${hit[0]})`);
      }
      const e: MemEntity = { kind, name: file, aliases: [], notes: "" };
      if (file !== name || s.stem !== name) e.title = name;
      ents[pathOf(kind, file)] = e;
      save();
      return summarize(pathOf(kind, file), e, links());
    },

    update(path: string, rawPatch: EntityPatch): EntityDetail {
      const e = entityAt(path);
      const patch = EntityPatchSchema.parse(rawPatch);
      const next: MemEntity = { ...e, aliases: [...e.aliases] };
      const opt = (v: string) => (v.trim() === "" ? undefined : v.trim());
      if (patch.title !== undefined) next.title = opt(patch.title);
      if (patch.aliases !== undefined) {
        const seen = new Set<string>();
        const clean: string[] = [];
        for (const a of patch.aliases.map((x) => x.trim()).filter(Boolean)) {
          const k = nameKey(a);
          if (seen.has(k)) continue;
          seen.add(k);
          const owner = aliasOwner(k, path);
          if (owner) fail(`"${a}" is already an alias of ${owner[1]}`);
          clean.push(a);
        }
        next.aliases = clean;
      }
      if (patch.relationship !== undefined) next.relationship = opt(patch.relationship);
      if (patch.birthday !== undefined) {
        if (patch.birthday !== "" && !isISODate(patch.birthday))
          fail(`"${patch.birthday}" is not a date (use YYYY-MM-DD)`);
        next.birthday = opt(patch.birthday);
      }
      if (patch.notes !== undefined) next.notes = patch.notes;
      ents[path] = next;
      save();
      return detail(path);
    },

    /** Notes that use `#tag`: journal days (newest first) then other notes, with the line. */
    tagNotes(tag: string): Mention[] {
      const key = nameKey(tag);
      const lineWith = (text: string) =>
        text
          .split(/\r?\n/)
          .find((l) => scanLinks(l).tags.some((t) => nameKey(t) === key))
          ?.trim()
          .slice(0, 160) ?? "";
      const uses = (text: string) => scanLinks(text).tags.some((t) => nameKey(t) === key);
      const fromDays = days
        .dates()
        .filter((d) => uses(days.body(d)))
        .sort()
        .reverse()
        .map((d) => ({
          path: journalPath(d),
          kind: "journal",
          name: d,
          date: d,
          context: lineWith(days.body(d)),
        }));
      const fromNotes = rows()
        .filter(([, e]) => uses(e.notes))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([path, e]) => ({
          path,
          kind: e.kind,
          name: e.name,
          date: null,
          context: lineWith(e.notes),
        }));
      return [...fromDays, ...fromNotes].slice(0, MENTION_LIMIT);
    },

    /** Back to a fresh vault's library; returns how many notes were removed. */
    reset(): number {
      const starter = new Set(SEEDED_EMOTIONS.map(nameKey));
      let removed = 0;
      for (const [path, e] of rows()) {
        if (e.kind === "emotion" && starter.has(nameKey(e.name))) continue;
        delete ents[path];
        removed++;
      }
      const have = new Set(rows().map(([, e]) => nameKey(e.name)));
      for (const name of SEEDED_EMOTIONS) {
        if (!have.has(nameKey(name))) {
          ents[pathOf("emotion", name)] = { kind: "emotion", name, aliases: [], notes: "" };
        }
      }
      save();
      return removed;
    },

    delete(path: string): void {
      entityAt(path);
      delete ents[path];
      save();
    },

    rename(path: string, rawName: string): RenameResult {
      const e = entityAt(path);
      if (e.kind === "tag") fail("tag notes can't be renamed here yet");
      const name = rawName.trim();
      const s = fileStem(name);
      if (!s.ok) return fail(s.error);
      const oldKey = nameKey(e.name);
      const newKey = nameKey(s.stem);
      for (const [p] of byNameKey(newKey)) if (p !== path) fail(`"${name}" already exists (${p})`);
      const same = sameKindWithKey(e.kind, nameKey(name));
      if (same && same !== path) fail(`"${name}" already exists (${same})`);

      const newPath = pathOf(e.kind, s.stem);
      const moved: MemEntity = { ...e, name: s.stem, title: s.stem !== name ? name : undefined };
      delete ents[path];
      ents[newPath] = moved;

      let updatedNotes = 0;
      for (const d of days.dates()) {
        const [body, n] = rewriteLinks(days.body(d), oldKey, s.stem);
        if (n) {
          days.setBody(d, body);
          updatedNotes++;
        }
      }
      for (const [p, other] of rows()) {
        const [notes, n] = rewriteLinks(other.notes, oldKey, s.stem);
        if (!n) continue;
        ents[p] = { ...other, notes };
        if (p !== newPath) updatedNotes++;
      }
      save();
      return { entity: summarize(newPath, ents[newPath], links()), updatedNotes };
    },

    upcoming(from: string, limit = 50): UpcomingEvent[] {
      return links()
        .filter((l) => isISODate(l.key) && l.key >= from && l.key !== l.src.name)
        .sort((a, b) =>
          a.key < b.key ? -1 : a.key > b.key ? 1 : a.src.name.localeCompare(b.src.name),
        )
        .slice(0, limit)
        .map((l) => ({
          date: l.key,
          label: l.label,
          source: l.src.name,
          sourceDate: l.src.kind === "journal" ? l.src.name : null,
        }));
    },
  };
}
