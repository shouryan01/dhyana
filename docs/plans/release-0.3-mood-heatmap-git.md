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

- [ ] Mood saved → valid YAML → readable elsewhere.
- [ ] Mood is offered once on the first open of today, never again that day; a second check-in can still be added by hand.
- [ ] Quit after a check-in but before typing → pending mood is still applied when the note is created.
- [ ] Heatmap accurate against files on disk.
- [ ] Restore an old version without data loss; git log is tidy.

## Reference study

Tolaria (Git boundaries, AutoGit), SoloMD (AutoGit), Apple Health (UX).
