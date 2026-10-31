import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useApp } from "@/app/context";
import { flushAll } from "@/app/flush";
import { backend } from "@/lib";
import { parseTheme, themeOf, type ThemeFamily } from "@/lib/backend";
import { addDays, formatShort, isISODate } from "@/lib/dates";
import { IS_DEV } from "@/lib/devSettings";
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
      {
        id: "palette",
        label: "Open command palette",
        group: "App",
        shortcut: "mod+k",
        run: () => app.openPalette("commands"),
      },
      {
        id: "today",
        label: "Go to today",
        group: "Navigate",
        shortcut: "g t",
        also: ["mod+shift+t"],
        keywords: "now",
        run: () => go(app.today),
      },
      {
        id: "prev",
        label: "Previous day",
        group: "Navigate",
        shortcut: "mod+[",
        also: ["["],
        run: () => go(addDays(current, -1)),
      },
      {
        id: "next",
        label: "Next day",
        group: "Navigate",
        shortcut: "mod+]",
        also: ["]"],
        run: () => go(addDays(current, 1)),
      },
      {
        id: "goto",
        label: "Go to date…",
        group: "Navigate",
        shortcut: "mod+g",
        also: ["g d"],
        keywords: "jump calendar",
        run: () => app.openPalette("goto-date"),
      },
      {
        id: "entity",
        label: "Go to person or place…",
        group: "Navigate",
        shortcut: "g p",
        keywords: "people places contacts open entity new create",
        run: () => app.openPalette("entity"),
      },
      {
        id: "library",
        label: "Open library",
        group: "Navigate",
        shortcut: "g l",
        keywords: "people places emotions tags browse all entities edit",
        run: () => navigate({ to: "/library" }),
      },
      {
        id: "year",
        label: "Open year view",
        group: "Navigate",
        shortcut: "g y",
        keywords: "heatmap calendar streak words mood overview stats",
        run: () =>
          navigate({ to: "/year", search: { year: Number(current.slice(0, 4)), view: "words" } }),
      },
      {
        id: "mood",
        label: "Add mood check-in",
        group: "Journal",
        shortcut: "m",
        keywords: "feeling emotion how am i valence log",
        run: () => {
          if (app.addCheckIn.current) return app.addCheckIn.current();
          // No day open: open today's, which picks the request up when it mounts.
          app.checkInRequested.current = true;
          void go(app.today);
        },
      },
      {
        id: "mood-panel",
        label: "Toggle mood panel",
        group: "Journal",
        shortcut: "g m",
        keywords: "graph chart valence feelings over time",
        run: app.toggleMoodPanel,
      },
      {
        id: "history",
        label: "Show version history",
        group: "Journal",
        shortcut: "g h",
        keywords: "versions git restore undo previous diff changes",
        run: () =>
          app.showHistory.current
            ? app.showHistory.current()
            : toast("Open a note to see its history"),
      },
      {
        id: "delete",
        label: "Delete this note…",
        group: "Journal",
        keywords: "remove trash page entry",
        run: () =>
          app.deleteNote.current ? app.deleteNote.current() : toast("Open a note to delete it"),
      },
      {
        id: "save",
        label: "Save now",
        group: "Journal",
        shortcut: "mod+s",
        keywords: "write flush autosave",
        run: () => void flushAll().then(() => toast.success("Saved", { duration: 1200 })),
      },
      {
        id: "focus",
        label: "Focus editor",
        group: "Journal",
        shortcut: "i",
        keywords: "write type",
        run: () => app.focusEditor.current?.(),
      },
      {
        id: "sidebar",
        label: "Toggle sidebar",
        group: "App",
        shortcut: "mod+\\",
        run: app.toggleSidebar,
      },
      {
        id: "settings",
        label: "Open settings",
        group: "App",
        shortcut: "mod+,",
        also: ["g s"],
        keywords: "preferences",
        run: () => navigate({ to: "/settings" }),
      },
      {
        id: "shortcuts",
        label: "Show keyboard shortcuts",
        group: "App",
        shortcut: "?",
        keywords: "help keys",
        run: () => navigate({ to: "/shortcuts" }),
      },
      {
        id: "reindex",
        label: "Rebuild index",
        group: "App",
        keywords: "repair refresh backlinks search people places",
        run: () =>
          void backend
            .rebuildIndex()
            .then(() => app.refreshEntities())
            .then(() => toast.success("Index rebuilt from your files"))
            .catch((e) => toast.error(`Couldn't rebuild the index: ${e}`)),
      },
      {
        id: "checkpoint",
        label: "Save a version now",
        group: "App",
        keywords: "history git commit checkpoint snapshot backup",
        run: () =>
          void flushAll()
            .then(() => backend.checkpoint("Saved by hand"))
            .then((id) =>
              id
                ? toast.success("Version saved", { description: "See it in a note's history." })
                : toast("Nothing to save yet"),
            )
            .catch((e) => toast.error(`Couldn't save a version: ${e}`)),
      },
      {
        id: "mode",
        label: "Toggle dark / light mode",
        group: "App",
        shortcut: "mod+shift+l",
        keywords: "theme appearance night",
        run: () => void app.toggleMode(),
      },
      {
        id: "theme-dhyana",
        label: "Theme: Dhyāna",
        group: "App",
        keywords: "appearance warm paper",
        run: () => setFamily("dhyana"),
      },
      {
        id: "theme-basic",
        label: "Theme: Basic",
        group: "App",
        keywords: "appearance neutral default",
        run: () => setFamily("basic"),
      },
      // Dev builds only; production users don't replay onboarding.
      ...(IS_DEV
        ? [
            {
              id: "onboarding",
              label: "Replay onboarding",
              group: "App" as const,
              keywords: "welcome setup tour",
              run: app.replayOnboarding,
            },
          ]
        : []),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [
      app.today,
      app.app?.theme,
      app.toggleSidebar,
      app.toggleMode,
      app.toggleMoodPanel,
      app.replayOnboarding,
      current,
      navigate,
    ],
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
      // Inside a dialog (the check-in, history, a confirmation) only chords apply, so a plain
      // "m" on a focused button doesn't start something else underneath.
      const inDialog = (e.target as HTMLElement | null)?.closest?.(
        '[role="dialog"], [role="alertdialog"]',
      );
      if (e.key === "Escape" && inText && (e.target as HTMLElement).isContentEditable) {
        // An open @ ! # $ popup gets the first Esc (it closes itself); the next one leaves the editor.
        if (document.querySelector("[data-suggest-popup]")) return;
        (e.target as HTMLElement).blur(); // Esc leaves the editor so single-key shortcuts work
        return;
      }
      const action = dispatcher(e, inText || !!inDialog);
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
      action: {
        label: "Go to today",
        onClick: () => navigate({ to: "/day/$date", params: { date: app.today } }),
      },
    });
  }, [app.today, navigate]);
}
