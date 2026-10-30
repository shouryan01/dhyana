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
import { getDevSettings } from "@/lib/devSettings";
import {
  parseTheme,
  themeOf,
  type AppState,
  type Font,
  type SettingsPatch,
  type Theme,
} from "@/lib/backend";
import { todayISO } from "@/lib/dates";
import { setDirectory } from "@/lib/entityDirectory";
import type { EntityKind, EntitySummary, TagInfo } from "@/lib/schema";

type PaletteMode = "commands" | "goto-date" | "entity";

interface AppContextValue {
  app: AppState | null;
  loadError: string | null;
  updateSettings(patch: SettingsPatch): Promise<void>;
  /** Flip light/dark within the current theme family (Dhyana or Basic). */
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

  /** People, places and emotions in the vault, and tags in use. Refreshed when files change. */
  entities: EntitySummary[];
  tags: TagInfo[];
  /** Bumped whenever entities or backlinks may have changed (entity pages refetch on it). */
  entitiesVersion: number;
  refreshEntities(): Promise<void>;
  /** Creates the note, then refreshes the lists so the new name resolves immediately. */
  createEntity(kind: EntityKind, name: string): Promise<EntitySummary>;

  /** The editor registers a focus function here so "Focus editor" works from anywhere. */
  focusEditor: { current: (() => void) | null };
  /** Registered by the open day; asks to delete it (after confirmation). Null when no note is open. */
  deleteNote: { current: (() => void) | null };
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
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
  const [replaying, setReplaying] = useState(() => getDevSettings().alwaysOnboarding);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("commands");
  const [daysVersion, setDaysVersion] = useState(0);
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [entitiesVersion, setEntitiesVersion] = useState(0);
  const focusEditor = useRef<(() => void) | null>(null);
  const deleteNote = useRef<(() => void) | null>(null);

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

  const refreshEntities = useCallback(async () => {
    try {
      const [list, tagList] = await Promise.all([backend.listEntities(), backend.listTags()]);
      setDirectory(list); // before state, so chips rendered right after resolve correctly
      setEntities(list);
      setTags(tagList);
    } catch {
      setDirectory([]); // no vault yet (onboarding)
      setEntities([]);
      setTags([]);
    }
    setEntitiesVersion((v) => v + 1);
  }, []);

  const vaultPath = app?.vaultPath ?? null;
  useEffect(() => {
    if (!vaultPath) return;
    void refreshEntities();
    let cancelled = false;
    let off: (() => void) | undefined;
    let timer: number | undefined;
    backend
      .onEntitiesChanged(() => {
        // A burst of file events (a rename touches many notes) becomes one refresh.
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void refreshEntities(), 120);
      })
      .then((u) => {
        // Subscribing is async; if we were cleaned up meanwhile, unsubscribe straight away.
        if (cancelled) u();
        else off = u;
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      off?.();
    };
  }, [vaultPath, refreshEntities]);

  const createEntity = useCallback(
    async (kind: EntityKind, name: string) => {
      const made = await backend.createEntity(kind, name);
      await refreshEntities();
      return made;
    },
    [refreshEntities],
  );

  const updateSettings = useCallback(async (patch: SettingsPatch) => {
    const next = await backend.updateSettings(patch);
    setApp(next);
    applyAppearance(next.theme, next.font);
  }, []);

  const toggleMode = useCallback(async () => {
    if (!app) return;
    const { family, mode } = parseTheme(app.theme);
    await updateSettings({ theme: themeOf(family, mode === "dark" ? "light" : "dark") });
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
      entities,
      tags,
      entitiesVersion,
      refreshEntities,
      createEntity,
      focusEditor,
      deleteNote,
    }),
    [
      app,
      loadError,
      updateSettings,
      toggleMode,
      setVault,
      previewAppearance,
      today,
      replaying,
      sidebarOpen,
      paletteOpen,
      paletteMode,
      daysVersion,
      entities,
      tags,
      entitiesVersion,
      refreshEntities,
      createEntity,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
