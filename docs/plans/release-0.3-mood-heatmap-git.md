# Release 0.3 — Mood, Heatmap, Git History

## Mood
- **Check-in flow before writing** (optional, skippable, remembered preference): Apple Health-style valence slider (very unpleasant → very pleasant) with animated shape/color, then emotion labels (from emotion entities), then optional factors (sleep, work, family...).
- A check-in alone never creates the day file: it is held pending and written to frontmatter when the first text creates the note.
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
- [ ] Heatmap accurate against files on disk.
- [ ] Restore an old version without data loss; git log is tidy.

## Reference study
Tolaria (Git boundaries, AutoGit), SoloMD (AutoGit), Apple Health (UX).
