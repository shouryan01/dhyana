import { z } from "zod";
import type {
  EntityDetail,
  EntityKind,
  EntityPatch,
  EntitySummary,
  Mention,
  RenameResult,
  TagInfo,
  UpcomingEvent,
} from "./schema";

export type {
  EntityDetail,
  EntityKind,
  EntityPatch,
  EntitySummary,
  Mention,
  RenameResult,
  TagInfo,
  UpcomingEvent,
} from "./schema";

export const THEMES = ["dhyana-light", "dhyana-dark", "basic-light", "basic-dark"] as const;
export type Theme = (typeof THEMES)[number];
export type ThemeFamily = "dhyana" | "basic";
export type Mode = "light" | "dark";

/** Settings saved by earlier builds: paper / light / dark, then the "default" family (now "basic"). */
const LEGACY_THEMES: Record<string, Theme> = {
  paper: "dhyana-light",
  light: "basic-light",
  dark: "basic-dark",
  "default-light": "basic-light",
  "default-dark": "basic-dark",
};

export const ThemeSchema = z.preprocess(
  (v) => (typeof v === "string" && v in LEGACY_THEMES ? LEGACY_THEMES[v] : v),
  z.enum(THEMES),
);
export const FontSchema = z.enum(["serif", "sans", "mono"]);

export const themeOf = (family: ThemeFamily, mode: Mode): Theme => `${family}-${mode}`;
export const parseTheme = (theme: Theme): { family: ThemeFamily; mode: Mode } => {
  const [family, mode] = theme.split("-") as [ThemeFamily, Mode];
  return { family, mode };
};
export type Font = z.infer<typeof FontSchema>;

export const AppStateSchema = z.object({
  onboardingCompleted: z.boolean(),
  vaultPath: z.string().nullable(),
  theme: ThemeSchema.catch("dhyana-light"),
  font: FontSchema.catch("serif"),
});
export type AppState = z.infer<typeof AppStateSchema>;

export const DayFileSchema = z.object({
  exists: z.boolean(),
  body: z.string(),
  hash: z.string(),
  created: z.string().nullable(),
  modified: z.string().nullable(),
});
export type DayFile = z.infer<typeof DayFileSchema>;

export const SaveResultSchema = z.object({
  status: z.enum(["saved", "skipped", "conflict"]),
  hash: z.string(),
  created: z.string().nullable(),
  modified: z.string().nullable(),
});
export type SaveResult = z.infer<typeof SaveResultSchema>;

export interface SettingsPatch {
  onboardingCompleted?: boolean;
  theme?: Theme;
  font?: Font;
}

/** Everything the UI needs from the Rust core. Swapped for an in-memory fake outside Tauri. */
export interface Backend {
  readonly native: boolean;
  getAppState(): Promise<AppState>;
  updateSettings(patch: SettingsPatch): Promise<AppState>;
  defaultVaultPath(): Promise<string>;
  setVault(path: string): Promise<AppState>;
  pickFolder(): Promise<string | null>;
  readDay(date: string): Promise<DayFile>;
  saveDay(
    date: string,
    body: string,
    expectedHash: string | null,
    force: boolean,
  ): Promise<SaveResult>;
  /** Moves the day's file to the OS trash. Resolves to whether there was a file to delete. */
  deleteDay(date: string): Promise<boolean>;
  listDays(year: number, month: number): Promise<string[]>;
  /** Years that have a journal folder, oldest first. */
  listYears(): Promise<number[]>;
  onVaultChanged(cb: (dates: string[]) => void): Promise<() => void>;

  /** People, places and emotions (not tags), with how often they are mentioned. */
  listEntities(): Promise<EntitySummary[]>;
  /** Tags in use plus registered ones, most used first. */
  listTags(): Promise<TagInfo[]>;
  /** An entity's properties, notes and backlinks. `path` is the vault-relative path from a summary. */
  getEntity(path: string): Promise<EntityDetail>;
  /** Creates the note. Rejects with a readable message if the name is taken or invalid. */
  createEntity(kind: EntityKind, name: string): Promise<EntitySummary>;
  updateEntity(path: string, patch: EntityPatch): Promise<EntityDetail>;
  /** Renames the note and rewrites every link to it across the vault. */
  renameEntity(path: string, newName: string): Promise<RenameResult>;
  /** Notes that use `#tag`, newest journal days first, each with the line that mentions it. */
  tagNotes(tag: string): Promise<Mention[]>;
  /**
   * Clears the library back to a fresh vault's: people, places, notes, tag pages and any emotion
   * outside the starter set go to the OS trash; missing starter emotions come back. Journal days
   * are untouched. Resolves to how many files were removed.
   */
  resetLibrary(): Promise<number>;
  /** Moves the note to the OS trash. Links to it elsewhere stay and show as unresolved. */
  deleteEntity(path: string): Promise<void>;
  /** `$date` events on or after `from` (YYYY-MM-DD), soonest first. */
  upcoming(from: string, limit?: number): Promise<UpcomingEvent[]>;
  /** Drops the index and rebuilds it from the files. */
  rebuildIndex(): Promise<void>;
  /** Fires when entities, links or tags may have changed (any note file changed). */
  onEntitiesChanged(cb: () => void): Promise<() => void>;
}
