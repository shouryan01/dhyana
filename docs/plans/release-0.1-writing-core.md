# Release 0.1 — Writing Core

**Goal:** a beautiful, minimal app you can open and journal in daily. No AI, no entities.

## Scope
- Tauri 2 + Vite + React + TS + Tailwind + shadcn + TanStack Router + zod scaffold; lint/format/test setup (Vitest, Playwright optional, `cargo test`).
- **Splash screen** (shows while Rust core opens the vault).
- **Onboarding** (first launch): welcome → choose/create vault folder → theme/font → done. (Journal day = local calendar day, midnight to midnight.) Skippable defaults. Also mention that phone capture is possible via Obsidian (link to `docs/mobile.md`).
- **Settings** (minimal page, opened from the bottom of the sidebar or the palette): theme (Dhyana / Light / Dark) and font, vault location (read-only display), **Replay onboarding**, and a keyboard-shortcuts reference.
  - *Replay onboarding* reruns the flow at any time (handy during development). It is non-destructive: steps are prefilled with current values, the vault step defaults to "keep current vault" (switching vaults asks for confirmation and never moves or deletes files), and finishing just saves the chosen theme/font. The "onboarding completed" flag lives in app data.
- **Command palette + shortcut registry** (pulled forward from the backlog; the Linear-feel centerpiece, master principle 9). Ctrl/Cmd+K opens a fuzzy palette: go to today, go to date, previous/next day, toggle sidebar, open settings, replay onboarding. One registry defines every action, its shortcut, and its label; the palette, tooltips, and settings reference all read from it. Shortcuts are fixed in 0.1 (remapping is 0.8).
- **Opens to today's note.** Resolve today in the system's local timezone; create file lazily on first keystroke (no empty files). **Midnight rollover:** if the date changes while the app is open, offer the new day without replacing the open draft.
- **Tiptap WYSIWYG**, always editable: headings, bold/italic, lists, task lists, quotes, links, code, hr. YAML frontmatter preserved untouched apart from the timestamp lines below (hidden or minimal properties panel).
- **Frontmatter timestamps** (master §4): a new day file is created with `id`, `type`, `date`, `created`, `modified`. Each content-changing save rewrites only the `modified` line; an unchanged note is never touched. Files lacking these keys (e.g. created in Obsidian on a phone) get them added surgically on first edit. This needs the line-level frontmatter editor in 0.1, a small version of the one 0.2 generalizes.
- **Atomic autosave** (write temp + rename), debounced; save-on-blur/close.
- **Markdown round-trip fidelity**: only blocks the user edited are re-serialized; all other source text is spliced back unchanged. Fixture corpus must include Obsidian-style files, CRLF, tables, footnotes, raw HTML, YAML with comments, `[[wikilinks]]`, `#tags`, and `<!-- dhyana:ai:* -->` blocks. Test "load→save unchanged" and "edit one block, only that block changes".
  - Constructs without a Tiptap node (tables, footnotes, raw HTML, comments, AI blocks) load as **opaque blocks**: shown as-is, not editable in 0.1, always spliced back verbatim.
  - When an edited block is re-serialized, match its original markers (`*` vs `_`, `-` vs `*` bullets, line endings) where the serializer allows, to keep diffs small.
  - Fallback if splicing proves unreliable: normalize only files dhyana created itself; never normalize imported files.
- **Calendar** (sidebar month view) marking days with entries; click navigates. Prev/next day shortcuts.
- **External-change handling (basic)**: file watcher; if file changed on disk and editor clean → reload; if dirty → non-destructive prompt.
- **Design:** Linear-like (master principle 9): minimal layout, instant response, collapsible sidebar, subtle motion. Sidebar layout: search, Today, calendar; at the bottom a dark/light toggle above Settings. Shortcut hints show on hover only. The Dhyana (paper) theme styles the entire app, sidebar included, with a warm accent; serif body font and a readable column width on the writing surface.
- **Docs skeleton:** root `README.md` (short: tagline, screenshots, quick start, links) plus `docs/getting-started.md`, `tech-stack.md`, `architecture.md` (mermaid diagram), `vault-format.md`, `keyboard-shortcuts.md`, `mobile.md` per master §10. Fill the Commands section of `CLAUDE.md` once the scaffold exists.

## Not in 0.1
Entities, `@ ! # $`, mood, git, search, analytics, AI, dictation (OS dictation just works in the editor). Also deferred (see backlog): slash menu, image paste, focus/typewriter mode, remappable shortcuts.

## Spikes (time-boxed, throwaway)
1. Tiptap + markdown serializer choice (tiptap-markdown vs. remark-based) judged on round-trip fixtures. Remark/mdast carries source positions, which the splice approach needs; weigh that heavily. Also confirm opaque-block nodes survive load→save.
2. Prototype inline diff decorations (red/green, accept/reject) to confirm the 0.6 approach is feasible.

## Exit criteria
Status: implemented on branch `release/0.1-writing-core`. Checked items were verified by automated tests and by driving the real Tauri app; unchecked items need a human.

- [x] Fresh install → onboarding → typing in today's note → file on disk is clean markdown with `created` and `modified`. (Lazy creation confirmed: no file or `journal/` folder until the first keystroke.)
- [x] Saving an unedited note changes no bytes; editing one changes only that block and `modified`. (Fixture corpus in LF and CRLF; Rust no-op save test; live check showed exactly two changed lines.)
- [x] Settings → Replay onboarding reruns the flow without touching the existing vault.
- [x] Every action in the palette has a shortcut or is reachable by keyboard alone; typing never triggers single-key shortcuts.
- [ ] Open the vault in Obsidian/VS Code: reads fine. A note created in Obsidian (no frontmatter) opens and saves correctly. (Frontmatter-less files are covered by Rust tests; not yet opened in Obsidian itself.)
- [x] Round-trip corpus passes; no data loss on crash (atomic write test: an unfinished save leaves the original intact).
- [ ] README is short; the `docs/` pages exist and the quick start works on a clean machine. (Pages exist; clean-machine run not done.)
- [ ] You use it for a week.

### Deferred within 0.1
- Opaque blocks (tables, footnotes, raw HTML, AI blocks) are shown as raw markdown and are not editable yet.
- Bold-code and similar mark combinations the editor can't represent are kept as inline opaque chips.
- Shortcuts are fixed (remapping is 0.8). The window uses the OS title bar.

## Reference study
Paperling (writing UI), Glyph (daily-note config), Tolaria (external-change reconcile), Linear (interaction feel, palette, shortcuts), Zed (keymap model, for 0.8 remapping).
