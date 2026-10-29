# Release 0.8 — Sync, Dictation, Polish

## Sync via user-chosen folder
- Onboarding option: vault lives inside Google Drive / iCloud / OneDrive folder.
- Git dir and index are already outside the vault (since 0.2/0.3); verify with each synced-folder provider. Trade-off to document: a second machine has its own git history.
- Detect sync conflict copies ("file (conflicted copy)"), surface a merge/diff UI.
- Full external-change reconcile: file changed while open/dirty, midnight rollover with open draft, deleted/renamed files.
- Index rebuild robustness after sync bursts; `.dhyana/` excluded from sync (or tolerant).
- Optional: git remote push/pull as an alternative backup.

## Dictation
- v1 shipped by OS: add a mic hint and keyboard shortcut tip; ensure editor focus/IME works with Win+H and macOS dictation.
- Evaluate local Whisper (whisper.cpp) as a follow-up → backlog.

## Polish
- Performance pass, accessibility, keyboard nav, empty states, error toasts.
- Backup/export (zip), import from other apps.
- Crash recovery, logging, auto-update decision.

## Exit criteria
- [ ] Edit the same day on two machines via Drive → conflict surfaced, no loss.
- [ ] Midnight rollover offers new day without replacing the open draft.
