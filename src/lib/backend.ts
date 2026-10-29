import { z } from "zod";

export const ThemeSchema = z.enum(["paper", "light", "dark"]);
export const FontSchema = z.enum(["serif", "sans", "mono"]);
export type Theme = z.infer<typeof ThemeSchema>;
export type Font = z.infer<typeof FontSchema>;

export const AppStateSchema = z.object({
  onboardingCompleted: z.boolean(),
  vaultPath: z.string().nullable(),
  theme: ThemeSchema.catch("paper"),
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
  listDays(year: number, month: number): Promise<string[]>;
  onVaultChanged(cb: (dates: string[]) => void): Promise<() => void>;
}
