import {
  AppStateSchema,
  type AppState,
  type Backend,
  type DayFile,
  type SaveResult,
} from "./backend";
import { createEntityStore, journalPath, seedEntities, type MemEntity } from "./memoryEntities";
import { nameKey } from "./names";
import { CheckInSchema, type CheckIn, type Version } from "./schema";
import { countWords } from "./words";

/**
 * In-memory/localStorage stand-in for the Rust core, used when the UI runs in a plain browser
 * (`pnpm dev`, screenshots, UI tests). Mirrors the save rules of the real backend: a check-in
 * alone never creates a day, pending check-ins are written by the first text, and history keeps
 * one autosaved version per note per session and day (for journal days only).
 */
interface MemFile {
  body: string;
  created: string;
  modified: string;
  mood?: CheckIn[];
}

interface MemVersion {
  id: string;
  time: string;
  message: string;
  /** The day as of this version; null when it was deleted. */
  file: MemFile | null;
  /** Autosaved this session (later saves the same day replace it). */
  auto: boolean;
}

interface MoodState {
  offered: Record<string, string>;
  pending: Record<string, CheckIn[]>;
}

const KEY_SETTINGS = "dhyana:mem:settings";
const KEY_FILES = "dhyana:mem:files";
const KEY_ENTITIES = "dhyana:mem:entities";
const KEY_MOOD = "dhyana:mem:mood";
const KEY_HISTORY = "dhyana:mem:history";

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: stay in memory only */
  }
};

const hashText = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
};
/** Like the real file hash, it changes when the frontmatter (mood) changes, not just the body. */
const hashFile = (f: MemFile) =>
  hashText(f.mood?.length ? `${f.body}\u0000${JSON.stringify(f.mood)}` : f.body);

const now = () => new Date().toISOString();
const today = () => new Date().toDateString();

const dateOfPath = (path: string) =>
  /^journal\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})\.md$/.exec(path)?.[1];

const sameCheckIn = (a: CheckIn, b: CheckIn) => JSON.stringify(a) === JSON.stringify(b);

/** Trim, dedupe and range-check, like `CheckIn::normalized` in Rust. */
function normalized(c: CheckIn): CheckIn {
  const clean = (list: string[]) => {
    const seen = new Set<string>();
    return list
      .map((s) => s.trim())
      .filter((s) => s && !seen.has(nameKey(s)) && seen.add(nameKey(s)))
      .slice(0, 30);
  };
  const parsed = CheckInSchema.parse({ ...c, at: c.at.trim() });
  return {
    at: parsed.at,
    valence: Math.round(parsed.valence * 100) / 100 || 0,
    emotions: clean(parsed.emotions),
    factors: clean(parsed.factors),
  };
}

const flowList = (items: string[]) =>
  `[${items.map((s) => (/[,[\]{}:#"']/.test(s) ? JSON.stringify(s) : s)).join(", ")}]`;

/** The day as the file would read: frontmatter with any check-ins, then the body. */
function renderDay(f: MemFile): string {
  const mood = f.mood ?? [];
  const lines = ["---", `created: ${f.created}`, `modified: ${f.modified}`];
  if (mood.length) {
    lines.push("mood:");
    for (const c of mood) {
      const parts = [`at: "${c.at}"`, `valence: ${c.valence}`];
      if (c.emotions.length) parts.push(`emotions: ${flowList(c.emotions)}`);
      if (c.factors.length) parts.push(`factors: ${flowList(c.factors)}`);
      lines.push(`  - { ${parts.join(", ")} }`);
    }
  }
  return `${lines.join("\n")}\n---\n${f.body}`;
}

export function createMemoryBackend(): Backend {
  const stored = read<AppState>(KEY_SETTINGS, {
    onboardingCompleted: false,
    vaultPath: null,
    theme: "dhyana-light",
    font: "serif",
    askMood: true,
    autoCommit: true,
  });
  // Run stored settings through the schema so older saved themes (paper/light/dark) migrate.
  let settings: AppState = AppStateSchema.parse(stored);
  const files = read<Record<string, MemFile>>(KEY_FILES, {});
  const mood = read<MoodState>(KEY_MOOD, { offered: {}, pending: {} });
  const history = read<Record<string, MemVersion[]>>(KEY_HISTORY, {});
  // A fresh page load is a new session: nothing stored is folded into any more.
  for (const list of Object.values(history)) for (const v of list) v.auto = false;

  const listeners = new Set<(dates: string[]) => void>();
  const entityListeners = new Set<() => void>();
  const notifyEntities = () => entityListeners.forEach((cb) => cb());
  const notifyDays = (dates: string[]) => listeners.forEach((cb) => cb(dates));
  const saveMood = () => write(KEY_MOOD, mood);

  /** Records a day's current state as a version, folding into this session's one for today. */
  const record = (date: string, message?: string) => {
    if (!settings.autoCommit && !message) return;
    const path = journalPath(date);
    const list = (history[path] ??= []);
    const f = files[date] ? structuredClone(files[date]) : null;
    const last = list[0];
    const fold = !!last?.auto && !message && new Date(last.time).toDateString() === today();
    if (last && JSON.stringify(last.file) === JSON.stringify(f)) {
      if (message) last.auto = false; // now a checkpoint: never folded into
      write(KEY_HISTORY, history);
      return;
    }
    const base = fold ? list[1] : last;
    const version: MemVersion = {
      id: Math.random().toString(16).slice(2, 14),
      time: now(),
      message: message ?? `${!base?.file ? "Add" : f ? "Edit" : "Remove"} ${date}`,
      file: f,
      auto: !message,
    };
    if (fold) list[0] = version;
    else list.unshift(version);
    write(KEY_HISTORY, history);
  };

  const store = createEntityStore(
    {
      dates: () => Object.keys(files),
      body: (d) => files[d]?.body ?? "",
      setBody: (d, body) => {
        files[d] = { ...files[d], body, modified: now() };
        write(KEY_FILES, files);
        record(d);
      },
      renameEmotion: (oldKey, next) => {
        const changed: string[] = [];
        const rename = (list: CheckIn[]) => {
          let hit = false;
          for (const c of list) {
            for (let i = 0; i < c.emotions.length; i++) {
              if (nameKey(c.emotions[i]) !== oldKey) continue;
              c.emotions[i] = next;
              hit = true;
            }
          }
          return hit;
        };
        for (const [d, f] of Object.entries(files)) {
          if (f.mood && rename(f.mood)) {
            changed.push(d);
            record(d);
          }
        }
        for (const list of Object.values(mood.pending)) rename(list);
        write(KEY_FILES, files);
        saveMood();
        return changed;
      },
    },
    read<Record<string, MemEntity>>(KEY_ENTITIES, seedEntities()),
    (all) => write(KEY_ENTITIES, all),
  );
  /** Runs an entity mutation, then tells listeners (the real core does this via the watcher). */
  const mutate = <T>(fn: () => T): T => {
    const out = fn();
    notifyEntities();
    return out;
  };

  const persistSettings = () => write(KEY_SETTINGS, settings);

  const dayFile = (date: string): DayFile => {
    const f = files[date];
    const pendingMood = mood.pending[date] ?? [];
    if (!f) {
      return {
        exists: false,
        body: "",
        hash: "",
        created: null,
        modified: null,
        mood: [],
        pendingMood,
      };
    }
    return {
      exists: true,
      body: f.body,
      hash: hashFile(f),
      created: f.created,
      modified: f.modified,
      mood: f.mood ?? [],
      pendingMood,
    };
  };

  /** Applies a change to the day's check-ins: in the file when there is one, else pending. */
  const changeMood = (date: string, change: (list: CheckIn[]) => void): DayFile => {
    const f = files[date];
    const pending = mood.pending[date] ?? [];
    if (f) {
      const list = [...(f.mood ?? [])];
      for (const c of pending) if (!list.some((x) => sameCheckIn(x, c))) list.push(c);
      const before = JSON.stringify(f.mood ?? []);
      change(list);
      delete mood.pending[date];
      saveMood();
      if (JSON.stringify(list) !== before) {
        files[date] = { ...f, mood: list.length ? list : undefined, modified: now() };
        write(KEY_FILES, files);
        record(date);
      }
    } else {
      const list = [...pending];
      change(list);
      if (list.length) mood.pending[date] = list;
      else delete mood.pending[date];
      saveMood();
    }
    return dayFile(date);
  };

  const at = (list: CheckIn[], index: number) => {
    if (index < 0 || index >= list.length) throw new Error(`there is no check-in #${index + 1}`);
  };

  return {
    native: false,
    async getAppState() {
      return settings;
    },
    async updateSettings(patch) {
      settings = { ...settings, ...patch };
      persistSettings();
      return settings;
    },
    async defaultVaultPath() {
      return "~/Documents/dhyana";
    },
    async setVault(path) {
      settings = { ...settings, vaultPath: path };
      persistSettings();
      return settings;
    },
    async pickFolder() {
      return "~/Documents/dhyana";
    },
    async readDay(date) {
      return dayFile(date);
    },
    async saveDay(date, body, expectedHash, force): Promise<SaveResult> {
      const f = files[date];
      const current = f ? hashFile(f) : "";
      if (!force && expectedHash && expectedHash !== current) {
        return {
          status: "conflict",
          hash: current,
          created: f?.created ?? null,
          modified: f?.modified ?? null,
        };
      }
      if (!f && body.trim() === "")
        return { status: "skipped", hash: "", created: null, modified: null };
      if (f && f.body === body) {
        return { status: "skipped", hash: current, created: f.created, modified: f.modified };
      }
      const t = now();
      const list = [...(f?.mood ?? [])];
      for (const c of mood.pending[date] ?? [])
        if (!list.some((x) => sameCheckIn(x, c))) list.push(c);
      files[date] = {
        body,
        created: f?.created ?? t,
        modified: t,
        mood: list.length ? list : undefined,
      };
      if (mood.pending[date]) {
        delete mood.pending[date];
        saveMood();
      }
      write(KEY_FILES, files);
      record(date);
      notifyEntities();
      const saved = files[date];
      return { status: "saved", hash: hashFile(saved), created: saved.created, modified: t };
    },
    async deleteDay(date) {
      if (!files[date]) return false;
      delete files[date];
      write(KEY_FILES, files);
      record(date);
      notifyEntities();
      return true;
    },
    async listDays(year, month) {
      const prefix = `${year}-${String(month).padStart(2, "0")}-`;
      return Object.keys(files)
        .filter((d) => d.startsWith(prefix))
        .sort();
    },
    async listYears() {
      return [...new Set(Object.keys(files).map((d) => Number(d.slice(0, 4))))].sort(
        (a, b) => a - b,
      );
    },
    async onVaultChanged(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async addMood(date, checkin) {
      const c = normalized(checkin);
      const out = changeMood(date, (list) => list.push(c));
      notifyEntities();
      return out;
    },
    async updateMood(date, index, checkin) {
      const c = normalized(checkin);
      const out = changeMood(date, (list) => {
        at(list, index);
        list[index] = c;
      });
      notifyEntities();
      return out;
    },
    async deleteMood(date, index) {
      const out = changeMood(date, (list) => {
        at(list, index);
        list.splice(index, 1);
      });
      notifyEntities();
      return out;
    },
    async moodOffer(date) {
      if (!settings.askMood || mood.offered[date]) return false;
      const d = dayFile(date);
      return d.mood.length === 0 && d.pendingMood.length === 0;
    },
    async markMoodOffered(date, outcome) {
      if (outcome === "shown" && mood.offered[date]) return;
      mood.offered[date] = outcome;
      saveMood();
    },
    async dayStats(from, to) {
      return Object.keys(files)
        .filter((d) => d >= from && d <= to)
        .sort()
        .map((date) => {
          const list = files[date].mood ?? [];
          const avg = list.length
            ? Math.round((list.reduce((s, c) => s + c.valence, 0) / list.length) * 100) / 100
            : null;
          return { date, words: countWords(files[date].body), checkins: list.length, valence: avg };
        });
    },
    async onThisDay(date) {
      const md = date.slice(4);
      return Object.keys(files)
        .filter((d) => d.slice(4) === md && d < date)
        .sort()
        .reverse()
        .map((d) => ({
          date: d,
          words: countWords(files[d].body),
          excerpt: files[d].body
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .join(" ")
            .slice(0, 280),
        }));
    },
    async noteHistory(path) {
      return (history[path] ?? []).map((v): Version => ({
        id: v.id,
        time: v.time,
        message: v.message,
        deleted: !v.file,
      }));
    },
    async noteVersion(path, id) {
      const list = history[path] ?? [];
      const i = list.findIndex((v) => v.id === id);
      if (i < 0) throw new Error("no such version");
      const text = (f: MemFile | null | undefined) => (f ? renderDay(f) : null);
      const date = dateOfPath(path);
      return {
        text: text(list[i].file),
        previous: text(list[i + 1]?.file),
        current: date ? text(files[date]) : null,
      };
    },
    async restoreVersion(path, id) {
      const date = dateOfPath(path);
      const v = (history[path] ?? []).find((x) => x.id === id);
      if (!date || !v) throw new Error(`not a note path: ${path}`);
      if (!v.file) throw new Error(`that version has no copy of ${path}`);
      record(date, `Before restoring ${date}`);
      files[date] = structuredClone(v.file);
      write(KEY_FILES, files);
      record(date, `Restore ${date} to the version from ${new Date(v.time).toLocaleString()}`);
      notifyDays([date]);
      notifyEntities();
    },
    async checkpoint(reason) {
      let id: string | null = null;
      for (const date of Object.keys(files)) {
        record(date, reason || "Checkpoint");
        id = history[journalPath(date)]?.[0]?.id ?? id;
      }
      return id;
    },
    async listEntities() {
      return store.list();
    },
    async listTags() {
      return store.tags();
    },
    async getEntity(path) {
      return store.get(path);
    },
    async createEntity(kind, name) {
      return mutate(() => store.create(kind, name));
    },
    async updateEntity(path, patch) {
      return mutate(() => store.update(path, patch));
    },
    async renameEntity(path, newName) {
      return mutate(() => store.rename(path, newName));
    },
    async deleteEntity(path) {
      mutate(() => store.delete(path));
    },
    async tagNotes(tag) {
      return store.tagNotes(tag);
    },
    async resetLibrary() {
      return mutate(() => store.reset());
    },
    async upcoming(from, limit) {
      return store.upcoming(from, limit);
    },
    async rebuildIndex() {
      notifyEntities();
    },
    async onEntitiesChanged(cb) {
      entityListeners.add(cb);
      return () => entityListeners.delete(cb);
    },
  };
}
