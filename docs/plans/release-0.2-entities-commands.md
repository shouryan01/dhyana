# Release 0.2 — Entities & Quick Commands

**Goal:** typing `@ ! # $` creates structured, linked data stored as plain markdown.

## Scope

- **Rust index service** (SQLite): notes, frontmatter fields, links/backlinks, tags, entities. Rebuildable from files; incremental via watcher. Stored in app data keyed by vault id, not inside the vault. One day file = one entry.
- **Schema layer:** zod types in TS mirrored by Rust validation. Built-in types: `journal`, `person`, `place`, `emotion`, `tag`. Type definition notes in `types/`. Shared validation for UI and (later) AI.
- **Quick commands** (Tiptap suggestion extension):
  - `@` → people list (recent/frequent first, aliases searched); "create new person" inline.
  - `!` → emotion list (seeded vocabulary); renders as chip.
  - `#` → tag list + create new custom tag. Topics/themes only; people, places, and feelings use their own triggers.
  - `$` → date picker with natural-language ("next friday"); creates event.
  - **Places:** decide the trigger (master §9). Default: `@` also lists places, with the type icon beside each match.
- Entity pages: view/edit a person/place note (properties: aliases, relationship, birthday, notes), with **backlinks** ("mentions") list.
- **Name rules** (collisions): see master §4a.
- Upcoming-dates panel derived from `$` date wikilinks in the text (shown on today's note). Triggers fire only at line start or after whitespace.
- Comment-preserving YAML frontmatter edits (SoloMD reference) — don't reformat user YAML. Generalizes the small line-level editor from 0.1 (timestamps).
- Update `docs/vault-format.md` and `docs/keyboard-shortcuts.md` for the new triggers.
- Rename entity → update links across vault.

## Decisions made

Inline syntax and trigger rules: master §4. One entry per day file. User-defined types and typed relations moved to release 0.9. People keep a plain free-text `relationship` property.

## Spikes / open

Name-collision rules, comment-preserving YAML editor in Rust, zod/Rust single schema source (master §9). Build a synthetic-vault generator here; later releases need it.

## Exit criteria

- [ ] `@Ali` completes to Alice, file contains a wikilink, Alice's page lists the entry.
- [ ] Renaming Alice updates all links.
- [ ] Deleting `.dhyana/index.db` and relaunching rebuilds identical results.
- [ ] Vault still reads sensibly in Obsidian.

## Reference study

Tolaria (types/relations), SoloMD (YAML preservation, typed relations), Glyph (wikilink autocomplete, rename).
