# Release 0.1 — Writing Core

**Goal:** a beautiful, minimal app you can open and journal in daily. No AI, no entities.

## Scope
- Tauri 2 + Vite + React + TS + Tailwind + shadcn + TanStack Router + zod scaffold; lint/format/test setup (Vitest, Playwright optional, `cargo test`).
- **Splash screen** (shows while Rust core opens the vault).
- **Onboarding** (first launch): welcome → choose/create vault folder → theme/font → done. (Journal day = local calendar day, midnight to midnight.) Skippable defaults.
- **Opens to today's note.** Resolve today in the system's local timezone; create file lazily on first keystroke (no empty files). **Midnight rollover:** if the date changes while the app is open, offer the new day without replacing the open draft.
- **Tiptap WYSIWYG**, always editable: headings, bold/italic, lists, task lists, quotes, links, code, hr. YAML frontmatter preserved untouched (hidden or minimal properties panel).
- **Atomic autosave** (write temp + rename), debounced; save-on-blur/close.
- **Markdown round-trip fidelity**: only blocks the user edited are re-serialized; all other source text is spliced back unchanged. Fixture corpus must include Obsidian-style files, CRLF, tables, footnotes, raw HTML, YAML with comments, `[[wikilinks]]`, `#tags`, and `<!-- dhyana:ai:* -->` blocks. Test "load→save unchanged" and "edit one block, only that block changes".
- **Calendar** (sidebar month view) marking days with entries; click navigates. Prev/next day shortcuts.
- **External-change handling (basic)**: file watcher; if file changed on disk and editor clean → reload; if dirty → non-destructive prompt.
- **Design:** Linear-like minimal layout, paper theme (warm light brown, subtle), serif body font, readable column width.

## Not in 0.1
Entities, `@ ! # $`, mood, git, search, analytics, AI, dictation (OS dictation just works in the editor). Also deferred (see backlog): slash menu, image paste, command palette, focus/typewriter mode.

## Spikes (time-boxed, throwaway)
1. Tiptap + markdown serializer choice (tiptap-markdown vs. remark-based) judged on round-trip fixtures.
2. Prototype inline diff decorations (red/green, accept/reject) to confirm the 0.6 approach is feasible.

## Exit criteria
- [ ] Fresh install → onboarding → typing in today's note → file on disk is clean markdown.
- [ ] Open the vault in Obsidian/VS Code: reads fine.
- [ ] Round-trip corpus passes; no data loss on crash (kill during save).
- [ ] You use it for a week.

## Reference study
Paperling (writing UI), Glyph (daily-note config), Tolaria (external-change reconcile).
