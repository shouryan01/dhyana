# Release 0.3 — Mood, Heatmap, Git History

## Mood

- **Check-in flow before writing** (optional, skippable): Apple Health-style valence slider (very unpleasant → very pleasant) with animated shape/color, then emotion labels (from emotion entities), then optional factors, asked as "What's having the biggest impact on you?" and picked from: Health, Fitness, Self-Care, Hobbies, Identity, Spirituality, Community, Dating, Family, Friends, Partner, Tasks, Weather, Work, Education, Current Events, Travel, Money.
- **Offered once per day.** The flow appears automatically only on the first open of _today's_ note, and only if that day has no check-in yet and hasn't already been offered. Whether answered or skipped, it is not shown again that day (no re-prompt on reopening, navigating back, or restarting). It never auto-appears for past days. The "offered" ledger (journal date → answered/skipped) lives in app data, so it is per device and disposable; worst case a second machine offers it once.
- **Settings:** "Ask for mood on first open of the day" toggle (default on). Replaces the old "remembered preference".
- **Adding more later:** the user can return and write as many times as they like. Extra check-ins are manual: palette command "Add mood check-in" and a mood button on the day view. Same flow, appends to `mood:`.
- A check-in alone never creates the day file: it is held pending and written to frontmatter when the first text creates the note. Pending check-ins are persisted in app data (keyed by vault and date) so a crash or quit before typing doesn't lose them.
- Multiple check-ins per day; stored in frontmatter `mood:` list with time.
- Mood timeline within day; edit/delete check-ins.
- Basic mood graph (valence over time) in a side panel — real analytics in 0.4.

## Calendar upgrades

- GitHub-style **year heatmap** (intensity = words written or entries; toggle to color by mood valence).
- Calendar day cells show mood color dot.
- "On this day" in prior years.

## Git (git2-rs)

- Init repo on vault creation with the **git dir in app data** (keyed by vault id), worktree = the vault; nothing inside the vault. Keep `.dhyana/` and `.obsidian/` ignored. Restoring a version of an open note needs defined behavior.
- **Autocommit:** debounced on idle / app close, one commit per session per day with generated message; configurable, can disable.
- **History panel per note:** list versions, read-only diff view, restore a version (restore = new commit).
- Checkpoint API (`checkpoint(reason)`) to be reused by AI edits in 0.6.
- Must never touch user's unrelated staged work if repo is shared (Tolaria reference).

## Not in 0.3

Remote push/pull, sync.

## Exit criteria

- [x] Mood saved → valid YAML → readable elsewhere. (Each check-in is a one-line flow mapping; Rust tests cover read/write in flow, block and inline forms, CRLF, quoting. Not yet opened in Obsidian itself.)
- [x] Mood is offered once on the first open of today, never again that day; a second check-in can still be added by hand. (Ledger in app data; checked in a browser run: offered, answered, not offered after reload, second check-in via `M`.)
- [x] Quit after a check-in but before typing → pending mood is still applied when the note is created. (Pending check-ins are persisted in app data per vault; Rust and TS tests, plus the browser run.)
- [x] Heatmap accurate against files on disk. (Built from the index, which is derived from the files: word counts and check-ins per day file; `day_stats` tests.)
- [x] Restore an old version without data loss; git log is tidy. (Restore checkpoints what's there first, then commits the restore; a version per pause, with generated messages. Rust tests against real repos.)

Not yet clicked through in the desktop app (`pnpm tauri dev`): the UI was driven in the browser build against the in-memory backend, and the Rust side by `cargo test`.

## Built, and decisions made

- **Git dir in app data** as a **bare** repository (`<app data>/history/<vault id>.git`). Commits are built from the files on disk (blobs and trees) with no Git index or checkout, so nothing is ever written into the vault and a user's own `.git` (or staged work) is never read or touched. Hidden folders (`.git`, `.dhyana`, `.obsidian`) and files over 20 MB are left out.
- **Autocommit:** a version about 20 s after the files stop changing (driven by the watcher), every 5 minutes while writing continues without a pause, and on quit. Nothing is amended or squashed: a note's history is the continuous stream of what it was at each pause, and an open history dialog adds new versions live (`history://changed`). (First built as one commit per session per day; changed because a single entry hid the edits as they were made.) Settings → History turns it off. Messages are generated ("Edit 2026-10-30, Alice and 2 more", then one `A/M/D path` line per file).
- **Checkpoint API:** `History::checkpoint(reason)` / the `checkpoint` command, never amended by autocommits. "Save a version now" uses it; 0.6 AI edits will.
- **Restoring an open note:** restore = checkpoint of the current files, write the old version, commit "Restore …". The open editor sees it through the watcher like any external change: it reloads, or shows the "changed on disk" choice if there was unsaved typing (which the history dialog flushes first anyway).
- **Mood scale:** valence -1 … 1 with Apple Health's seven labels; emotions stored by filename; factors stored as lowercase ids (`self-care`, `current-events`). Renaming an emotion rewrites check-ins in files and pending ones (master §4a, closing the 0.2 note).
- **Mood colours:** a diverging violet ↔ neutral grey ↔ amber scale with separate dark-mode steps (`--mood-*` in `index.css`). In the mood heatmap, days with an entry but no check-in are outlined rather than given another grey.
- **Heatmap:** words (quartiles of the year's written days), entries, or mood (daily average), with streaks and totals. Opened by clicking the year above the sidebar calendar (it is a bordered button with a calendar icon, highlighted while that year is open) or `G Y`. The calendar's old year dropdown is gone; year-to-year moves are the arrows on the year page, the month arrows, and Go to date.
- **Note actions are a collapsible list under the date:** an `Actions` toggle that is always visible (with a dot per check-in). Opening it shows add mood check-in, version history and delete, then the day's check-in chips (click one to edit, `+` to add). While open, everything stays visible; the choice is remembered. Each action is also a palette action. (First built as a hover-only `⋯` dropdown, then as hover-only chips; changed to a plain list so nothing is hidden when you want it.)
- **The check-in time** is edited with an in-app picker (hour and minute columns, AM/PM on a 12-hour clock) instead of the browser's time input.
- **The mood shape in the check-in bounces** around its frame at a constant speed and reflects off the edges like a DVD logo, while its layers turn and breathe. Reduced motion keeps it still.
- **Mood graph:** a side panel (`G M`) with the day's check-ins and the last 30 days' daily averages; real analytics stay in 0.4.
- **On this day** shows on every day's note when earlier years have an entry on that date.
- Index schema bumped to 2 (word counts, a `moods` table); old indexes rebuild themselves on launch.

## Reference study

Tolaria (Git boundaries, AutoGit), SoloMD (AutoGit), Apple Health (UX).
