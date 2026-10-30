import {
  AppStateSchema,
  type AppState,
  type Backend,
  type DayFile,
  type SaveResult,
} from "./backend";
import { createEntityStore, seedEntities, type MemEntity } from "./memoryEntities";

/**
 * In-memory/localStorage stand-in for the Rust core, used when the UI runs in a plain browser
 * (`pnpm dev`, screenshots, UI tests). Mirrors the save rules of the real backend.
 */
interface MemFile {
  body: string;
  created: string;
  modified: string;
}

const KEY_SETTINGS = "dhyana:mem:settings";
const KEY_FILES = "dhyana:mem:files";
const KEY_ENTITIES = "dhyana:mem:entities";

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

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
};

const now = () => new Date().toISOString();

export function createMemoryBackend(): Backend {
  const stored = read<AppState>(KEY_SETTINGS, {
    onboardingCompleted: false,
    vaultPath: null,
    theme: "dhyana-light",
    font: "serif",
  });
  // Run stored settings through the schema so older saved themes (paper/light/dark) migrate.
  let settings: AppState = AppStateSchema.parse(stored);
  const files = read<Record<string, MemFile>>(KEY_FILES, {});
  const listeners = new Set<(dates: string[]) => void>();
  const entityListeners = new Set<() => void>();
  const notifyEntities = () => entityListeners.forEach((cb) => cb());
  const store = createEntityStore(
    {
      dates: () => Object.keys(files),
      body: (d) => files[d]?.body ?? "",
      setBody: (d, body) => {
        files[d] = { ...files[d], body, modified: now() };
        write(KEY_FILES, files);
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
    async readDay(date): Promise<DayFile> {
      const f = files[date];
      if (!f) return { exists: false, body: "", hash: "", created: null, modified: null };
      return {
        exists: true,
        body: f.body,
        hash: hash(f.body),
        created: f.created,
        modified: f.modified,
      };
    },
    async saveDay(date, body, expectedHash, force): Promise<SaveResult> {
      const f = files[date];
      const current = f ? hash(f.body) : "";
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
      files[date] = { body, created: f?.created ?? t, modified: t };
      write(KEY_FILES, files);
      notifyEntities();
      return { status: "saved", hash: hash(body), created: files[date].created, modified: t };
    },
    async deleteDay(date) {
      if (!files[date]) return false;
      delete files[date];
      write(KEY_FILES, files);
      notifyEntities();
      return true;
    },
    async listDays(year, month) {
      const prefix = `${year}-${String(month).padStart(2, "0")}-`;
      return Object.keys(files)
        .filter((d) => d.startsWith(prefix))
        .sort();
    },
    async onVaultChanged(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
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
