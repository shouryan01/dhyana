import { z } from "zod";

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
  onVaultChanged(cb: (dates: string[]) => void): Promise<() => void>;
}
