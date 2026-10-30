# Release 0.10 — Tabs and Side-by-Side Notes

Open several notes at once as tabs, and put two notes next to each other. Not scheduled; this is a plan for when the earlier releases have settled. Tabs ship first and are usable on their own; split panes are a second step.

## Why this is more than a UI change

Today the app has one of everything: one router outlet, one mounted editor, one "current editor" in the app context (`focusEditor`, `deleteNote`), and one set of flush callbacks that run when you leave a note. Each of those assumes a single open note, so the work is mostly in making them per-tab.

## Tabs

- **Tab model:** an ordered list of tabs, each a route (`/day/$date`, `/entity?path=`, library, settings) plus a title and a dirty flag. The active tab drives the URL; the rest are kept in state. The list is persisted in app data (per vault) so a restart reopens them. It is disposable, like the index.
- **Keep-alive editors:** each open note keeps its own mounted editor while its tab is hidden, so unsaved text, undo history, scroll and cursor survive switching. Cap the number of live editors (for example 8) and unmount the least recently used one after flushing it.
- **Per-tab plumbing:** `focusEditor`, `deleteNote` and the flush registry move from singletons to "the active tab's". Save, delete and focus act on the focused tab.
- **Behaviour:** open in a new tab with `Mod` + click on a link, calendar day or Library row; `Mod T` new tab (opens today), `Mod W` close, `Ctrl Tab` / `Ctrl Shift Tab` and `Mod 1..9` switch, drag to reorder, middle-click closes. Every action goes through the shortcut registry and the palette ("Close tab", "Next tab", "Open in new tab"). Reopen closed tab (`Mod Shift T` is taken by "Go to today", so pick another chord).
- **Chrome:** a thin tab strip in the title bar area, Linear-style: instant, no animation longer than 100 ms, title shows the date or note name, a dot for unsaved changes, the type icon for entities.
- **Close and delete:** closing a tab flushes it. Deleting a note (move to the OS trash) closes every tab showing it. Renaming an entity updates tab titles and paths.

## Side by side

- **Panes:** a layout of one or two panes (left/right first; top/bottom later if wanted), each pane with its own tab list. Drag a tab to the edge to split; `Mod \` stays "toggle sidebar", so use a different chord for "split right".
- **Same file in two panes:** allowed, but both views must stay in sync. The simplest safe rule is that a file has one live editor and the second pane shows the same editor state read-write through a shared document, falling back to read-only if that proves fragile. Decide in a spike before building. The existing external-change and conflict handling (hash check on save) must work between panes, not only against disk.
- **Linking across panes:** clicking a `[[link]]` in one pane can open in the other pane (setting, default off).
- **Layout state:** pane sizes and which tabs live where are persisted with the tab list.

## Risks

1. Two editors on one file (above). Spike first, with a test for edits made in pane A appearing in pane B and for the save-conflict path.
2. Memory with many live editors; hence the cap and LRU unmount.
3. Hash-based routing and back/forward: each tab needs its own history, or back/forward becomes confusing. Start with per-tab "back" only if needed.
4. Single-key shortcuts and focus: they must target the focused pane, and `Esc` leaving the editor must keep that pane focused.

## Not in 0.10

Detachable windows (tabs dragged into a separate OS window), tab groups, pinned tabs, and syncing open tabs across devices.

## Exit criteria

- [ ] Several notes open as tabs; switching keeps unsaved text, undo and cursor.
- [ ] Quit with tabs open and unsaved edits: everything is saved, and the tabs come back on next launch.
- [ ] Delete or rename a note that is open in a tab: the tab closes or updates, no stale editor writes the old file.
- [ ] Two panes side by side; the same note open in both stays consistent and never loses an edit.
- [ ] An external edit to a file open in a background tab or a second pane is reconciled with the existing conflict rules.
- [ ] Every tab and pane action is in the palette and the shortcuts page.
