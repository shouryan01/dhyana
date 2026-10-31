import { z } from "zod";
import {
  CheckInSchema,
  type CheckIn,
  type DayStat,
  type EntityDetail,
  type EntityKind,
  type EntityPatch,
  type EntitySummary,
  type Mention,
  type OnThisDay,
  type RenameResult,
  type TagInfo,
  type UpcomingEvent,
  type Version,
  type VersionContent,
} from "./schema";

export type {
  CheckIn,
  DayStat,
  EntityDetail,
  EntityKind,
  EntityPatch,
  EntitySummary,
  Mention,
  OnThisDay,
  RenameResult,
  TagInfo,
  UpcomingEvent,
  Version,
  VersionContent,
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
  askMood: z.boolean().catch(true),
  autoCommit: z.boolean().catch(true),
});
export type AppState = z.infer<typeof AppStateSchema>;

export const DayFileSchema = z.object({
  exists: z.boolean(),
  body: z.string(),
  hash: z.string(),
  created: z.string().nullable(),
  modified: z.string().nullable(),
  /** Check-ins in the file's frontmatter. */
  mood: z.array(CheckInSchema),
  /** Check-ins held in app data until the first text creates the file. */
  pendingMood: z.array(CheckInSchema),
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
  askMood?: boolean;
  autoCommit?: boolean;
}

export type MoodOffer = "shown" | "answered" | "skipped";

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

  /**
   * Mood check-ins. With a day file they go into its `mood:` frontmatter; without one they are
   * held (in app data) until the first text creates the file. `index` counts the file's
   * check-ins first, then the pending ones. Each resolves to the day as it is now.
   */
  addMood(date: string, checkin: CheckIn): Promise<DayFile>;
  updateMood(date: string, index: number, checkin: CheckIn): Promise<DayFile>;
  deleteMood(date: string, index: number): Promise<DayFile>;
  /** Should the check-in be offered for this day (setting on, none yet, not offered before)? */
  moodOffer(date: string): Promise<boolean>;
  markMoodOffered(date: string, outcome: MoodOffer): Promise<void>;
  /** Words and check-ins per journal day, `from` to `to` inclusive; days without a file are absent. */
  dayStats(from: string, to: string): Promise<DayStat[]>;
  /** Entries from earlier years on the same month and day, newest first. */
  onThisDay(date: string): Promise<OnThisDay[]>;

  /** Versions of a note (vault-relative path), newest first. */
  noteHistory(path: string): Promise<Version[]>;
  noteVersion(path: string, id: string): Promise<VersionContent>;
  /** Puts the note back as it was in that version; the current text is kept as a version first. */
  restoreVersion(path: string, id: string): Promise<void>;
  /** Fires when a version is recorded (after a pause in writing, or on request). */
  onHistoryChanged(cb: () => void): Promise<() => void>;
  /** Records a version of the whole vault now. Resolves to its id (null if there is nothing yet). */
  checkpoint(reason: string): Promise<string | null>;

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
