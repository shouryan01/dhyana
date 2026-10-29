import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useApp } from "@/app/context";
import { parseTheme, themeOf, type ThemeFamily } from "@/lib/backend";
import { addDays, formatShort, isISODate } from "@/lib/dates";
import { createDispatcher, isTextTarget, type Action } from "@/lib/shortcuts";

/** The single registry of actions (palette, tooltips, settings reference, and key handler). */
export function useActions(): Action[] {
  const app = useApp();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { date?: string };
  const current = params.date && isISODate(params.date) ? params.date : app.today;

  const go = (date: string) => navigate({ to: "/day/$date", params: { date } });
  const setFamily = (family: ThemeFamily) => {
    const mode = app.app ? parseTheme(app.app.theme).mode : "light";
    void app.updateSettings({ theme: themeOf(family, mode) });
  };

  return useMemo<Action[]>(
    () => [
      { id: "palette", label: "Open command palette", group: "App", shortcut: "mod+k", run: () => app.openPalette("commands") },
      { id: "today", label: "Go to today", group: "Navigate", shortcut: "g t", also: ["mod+shift+t"], keywords: "now", run: () => go(app.today) },
      { id: "prev", label: "Previous day", group: "Navigate", shortcut: "mod+[", also: ["["], run: () => go(addDays(current, -1)) },
      { id: "next", label: "Next day", group: "Navigate", shortcut: "mod+]", also: ["]"], run: () => go(addDays(current, 1)) },
      { id: "goto", label: "Go to date…", group: "Navigate", shortcut: "mod+g", also: ["g d"], keywords: "jump calendar", run: () => app.openPalette("goto-date") },
      { id: "focus", label: "Focus editor", group: "Journal", shortcut: "i", keywords: "write type", run: () => app.focusEditor.current?.() },
      { id: "sidebar", label: "Toggle sidebar", group: "App", shortcut: "mod+\\", run: app.toggleSidebar },
      { id: "settings", label: "Open settings", group: "App", shortcut: "mod+,", also: ["g s"], keywords: "preferences", run: () => navigate({ to: "/settings" }) },
      { id: "shortcuts", label: "Show keyboard shortcuts", group: "App", shortcut: "?", keywords: "help keys", run: () => navigate({ to: "/settings", hash: "shortcuts" }) },
      { id: "mode", label: "Toggle dark / light mode", group: "App", shortcut: "mod+shift+l", keywords: "theme appearance night", run: () => void app.toggleMode() },
      { id: "theme-dhyana", label: "Theme: Dhyana", group: "App", keywords: "appearance warm paper", run: () => setFamily("dhyana") },
      { id: "theme-default", label: "Theme: Default", group: "App", keywords: "appearance neutral", run: () => setFamily("default") },
      { id: "onboarding", label: "Replay onboarding", group: "App", keywords: "welcome setup tour", run: app.replayOnboarding },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.today, app.app?.theme, app.toggleSidebar, app.toggleMode, app.replayOnboarding, current, navigate],
  );
}

/** Global key handling driven by the registry. */
export function useHotkeys(actions: Action[]) {
  const ref = useRef(actions);
  ref.current = actions;
  const dispatcher = useMemo(() => createDispatcher(() => ref.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const inText = isTextTarget(e.target);
      if (e.key === "Escape" && inText && (e.target as HTMLElement).isContentEditable) {
        (e.target as HTMLElement).blur(); // Esc leaves the editor so single-key shortcuts work
        return;
      }
      const action = dispatcher(e, inText);
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        action.run();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dispatcher]);
}

/** Midnight rollover: offer the new day, never replace what is open. */
export function useRolloverNotice() {
  const app = useApp();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { date?: string };
  const prevToday = useRef(app.today);
  const viewing = useRef(params.date);
  viewing.current = params.date;

  useEffect(() => {
    const was = prevToday.current;
    prevToday.current = app.today;
    if (was === app.today) return;
    // Only interrupt if the user is looking at what was "today" a moment ago.
    if (viewing.current !== was && viewing.current !== undefined) return;
    toast(`It's now ${formatShort(app.today)}`, {
      description: "Your open note stays as it is.",
      duration: Infinity,
      action: { label: "Go to today", onClick: () => navigate({ to: "/day/$date", params: { date: app.today } }) },
    });
  }, [app.today, navigate]);
}
