import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { backend } from "@/lib";
import type { AppState, Font, SettingsPatch, Theme } from "@/lib/backend";
import { todayISO } from "@/lib/dates";

type PaletteMode = "commands" | "goto-date";

interface AppContextValue {
  app: AppState | null;
  loadError: string | null;
  updateSettings(patch: SettingsPatch): Promise<void>;
  /** Flip between dark and the light theme you were last using (dhyana or light). */
  toggleMode(): Promise<void>;
  setVault(path: string): Promise<void>;
  /** Live-preview an appearance without persisting it (onboarding). Pass null to revert. */
  previewAppearance(a: { theme: Theme; font: Font } | null): void;

  today: string;

  replaying: boolean;
  replayOnboarding(): void;
  endReplay(): void;

  sidebarOpen: boolean;
  toggleSidebar(): void;

  paletteOpen: boolean;
  paletteMode: PaletteMode;
  openPalette(mode?: PaletteMode): void;
  closePalette(): void;

  /** Bumped whenever the set of day files may have changed (calendar dots refresh). */
  daysVersion: number;
  bumpDays(): void;

  /** The editor registers a focus function here so "Focus editor" works from anywhere. */
  focusEditor: { current: (() => void) | null };
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

const LAST_LIGHT_KEY = "dhyana:lastLightTheme";

function rememberLight(theme: Theme) {
  try {
    localStorage.setItem(LAST_LIGHT_KEY, theme);
  } catch {
    /* storage unavailable: fall back to the dhyana theme */
  }
}

function recallLight(): Theme {
  try {
    return localStorage.getItem(LAST_LIGHT_KEY) === "light" ? "light" : "paper";
  } catch {
    return "paper";
  }
}

function applyAppearance(theme: Theme, font: Font) {
  const el = document.documentElement;
  el.dataset.theme = theme;
  el.dataset.font = font;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [app, setApp] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [today, setToday] = useState(todayISO());
  const [replaying, setReplaying] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("commands");
  const [daysVersion, setDaysVersion] = useState(0);
  const focusEditor = useRef<(() => void) | null>(null);

  useEffect(() => {
    backend
      .getAppState()
      .then((s) => {
        setApp(s);
        applyAppearance(s.theme, s.font);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  // The date can change while the app is open; consumers decide what to do about it.
  useEffect(() => {
    const check = () => setToday((t) => (todayISO() !== t ? todayISO() : t));
    const id = window.setInterval(check, 15_000);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", check);
    };
  }, []);

  const updateSettings = useCallback(async (patch: SettingsPatch) => {
    const next = await backend.updateSettings(patch);
    setApp(next);
    applyAppearance(next.theme, next.font);
  }, []);

  const toggleMode = useCallback(async () => {
    if (!app) return;
    if (app.theme === "dark") {
      await updateSettings({ theme: recallLight() });
    } else {
      rememberLight(app.theme);
      await updateSettings({ theme: "dark" });
    }
  }, [app, updateSettings]);

  const setVault = useCallback(async (path: string) => {
    setApp(await backend.setVault(path));
    setDaysVersion((v) => v + 1);
  }, []);

  const previewAppearance = useCallback(
    (a: { theme: Theme; font: Font } | null) => {
      if (a) applyAppearance(a.theme, a.font);
      else if (app) applyAppearance(app.theme, app.font);
    },
    [app],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      app,
      loadError,
      updateSettings,
      toggleMode,
      setVault,
      previewAppearance,
      today,
      replaying,
      replayOnboarding: () => setReplaying(true),
      endReplay: () => setReplaying(false),
      sidebarOpen,
      toggleSidebar: () => setSidebarOpen((v) => !v),
      paletteOpen,
      paletteMode,
      openPalette: (mode = "commands") => {
        setPaletteMode(mode);
        setPaletteOpen(true);
      },
      closePalette: () => setPaletteOpen(false),
      daysVersion,
      bumpDays: () => setDaysVersion((v) => v + 1),
      focusEditor,
    }),
    [app, loadError, updateSettings, toggleMode, setVault, previewAppearance, today, replaying, sidebarOpen, paletteOpen, paletteMode, daysVersion],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
