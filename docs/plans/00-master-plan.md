# dhyana — Master Plan

AI-powered personal journal. Markdown on disk, offline-first, AI entirely optional.
Personal-use app (not distributed), so copying ideas/code from reference projects is acceptable.

## 1. Decisions locked (from planning Q&A)

| Area | Decision |
|---|---|
| Foundation | **Greenfield**. Other projects are references only; no fork of Tolaria. |
| Stack | Tauri 2 (Rust), Vite + React + TypeScript, Tailwind, shadcn/ui, TanStack Router (router only), zod |
| Editor | **Tiptap (ProseMirror)**, WYSIWYG only, always editable. No preview mode, no source mode. |
| Storage | **One markdown file per day**: `journal/YYYY/MM/YYYY-MM-DD.md`. One entry per day, no sections. |
| Entities | People, places, emotions etc. are **real markdown files** with YAML (aliases, relationship...). |
| Inline syntax | Plain markdown-friendly (wikilinks/`#tags`) so other apps read it sensibly. See §4. |
| Platforms | Windows + macOS desktop. Keep Rust core portable. |
| Git | Bundled via `git2-rs`; debounced autocommit; history UI. **Git dir lives in app data, outside the vault** (decided; avoids `.git` corruption in synced folders and a later migration). |
| Cloud | v1 = **user-chosen synced folder** (Drive/iCloud/OneDrive). Native APIs not planned. |
| Mood | Valence slider + emotion labels (+ optional factors), **multiple check-ins/day**, in frontmatter. |
| Inline emotions (`!sad`) | Count as data in analytics, separate from check-ins. |
| Privacy | Nothing leaves the machine unless a cloud provider is explicitly configured. Per-file (per-day) `private: true` excludes it from AI, index-for-AI, and anything derived from it that an AI or MCP client can see. Plain files + the flag is the whole privacy model (no encryption). |
| AI backends (first AI release) | Local OpenAI-compatible endpoint, BYO cloud API keys, **MCP server** for external agents (Claude etc.). ChatGPT GPT / Gemini Gem deferred. |
| AI edit modes | **Review-before-apply** and **review-after-apply** (user toggle). Git checkpoint before any AI edit. |
| Retrieval | Staged: SQLite FTS5 + metadata filters → local embeddings (sqlite-vec) hybrid → rerank only if needed. |
| Embeddings | Local in-app model (small ONNX/candle model), offline. |
| AI-written content | Lives in a **clearly marked, regenerable block**, user-approved. Never mixed with user text; AI classifications labeled as AI-derived in data. |
| Dictation v1 | Rely on OS dictation (Win+H / macOS), add a hint. Whisper later. |
| Analytics | Consistency, mood correlations, people & topics, writing style. |
| Workflow | Claude Code plan mode + these markdown plans. See §8. |
| Journal day | Plain local calendar day, midnight to midnight, system timezone. No custom day boundary. |
| Index location | SQLite index and vectors live in app data keyed by vault id, never inside the vault. `.dhyana/` in the vault holds only settings and chat sessions. |
| Language | English only (FTS tokenizer, lexicons, embedding model). |
| Mood alone | A mood check-in never creates the day file. It is held pending and written into frontmatter when the note is created by the first text. |
| Inline triggers | `@ ! # $` fire only at line start or after whitespace. |
| MCP | Separate local process launched by the client; counts as cloud egress (same consent + request log); read-only and off by default. (Default chosen; revisit in 0.5.) |
| Mobile | Out of scope; backlog. Vault is plain markdown, so other apps can edit it on a phone. |

## 2. Principles

1. **Files are the truth.** Index/cache is disposable and rebuildable from disk.
2. **Valid markdown always.** Extra features (YAML, wikilinks) must degrade gracefully in any app.
3. **Lossless round-trip.** Opening and saving an untouched note must not change bytes (modulo trailing newline). Test this early (v0.1 gate). Achieved by re-serializing only the blocks the user edited and splicing everything else back unchanged from the original text, not by trusting the serializer to reproduce the file.
4. **One of each:** one editor owner, one metadata/schema model (zod + Rust mirror), one index service, one AI tool contract, one Git controller, one "apply edit" path.
5. **AI is a plugin, not a dependency.** Every release before 0.5 must be fully usable with zero AI code paths active.
6. **AI must not bypass validation.** AI tools use the same schema validation as UI commands.
7. **Never silently rewrite the user's words.** Edits are surgical, reviewable, and Git-checkpointed.
8. **Three dates:** journal date (calendar uses this), created, modified.

## 3. Critical review of the Perplexity report

Useful: the project-to-feature mapping and the "who owns what" boundaries. Weak spots:

- **"Foundation = Tolaria"** ignores that Tolaria's BlockNote is block-based with a lossy markdown bridge — the opposite of what surgical AI diffs need. Greenfield on Tiptap is the better fit.
- **No editor comparison was done** on the single hardest requirement (inline accept/reject diffs in WYSIWYG). We must prototype this early (see 0.6 spike, pulled into a 0.1 risk spike).
- **Retrieval is over-specified** for ~365 files/year. Reranking is a late, optional step.
- **Claims are doc-derived, not tested.** Verify before copying: SoloMD's "branch-based review isolation", Paperling's diff UX, ScribeDog licensing/code reuse. License check each repo before lifting code.
- **8 projects is too many to study.** Study order: ScribeDog (companion UX) → NoteGen (retrieval) → Paperling (writing/diff UX) → SoloMD (YAML, recipes) → Tolaria (Git/external-change handling). Others only on demand.
- It correctly says calendar, Today-first launch, schema validation and analytics must be built by us.

## 4. Data model

```
vault/
  journal/2026/10/2026-10-28.md
  people/Alice.md        # type: person
  places/Cafe-Nero.md    # type: place
  emotions/sad.md        # type: emotion (seeded set)
  types/person.md        # type definitions (fields, icon, color)
  .dhyana/               # settings, chat sessions (index, vectors, git dir are in app data)
```

Entry frontmatter (all optional; zod-validated):

```yaml
---
id: 01J...               # stable ULID
type: journal
date: 2026-10-28         # journal date
created: 2026-10-28T07:12:00-05:00
private: false
mood:                    # check-ins, multiple/day
  - { at: "07:12", valence: 0.4, emotions: [calm, hopeful], factors: [sleep] }   # local time
---
```

Inline syntax (triggers fire only at line start or after whitespace):
- `@Alice` → `[[Alice]]` (resolved by alias to `people/Alice.md`)
- `!sad` → `[[sad]]` resolving to an `emotion`-typed note (rendered as a chip)
- `#tag` → `#tag`; custom tags get a tag registry
- `$date` → `[[2026-12-25|Mom's birthday]]`, a wikilink to that date's day note (which may not exist yet). The index derives upcoming events from these links; no duplicate frontmatter list.

AI-derived data lives in `<!-- dhyana:ai:start --> ... <!-- dhyana:ai:end -->` blocks, with `source: ai` in YAML where applicable.

### 4a. Name collisions (decided)

- Entity filenames are **unique across the whole vault** (people, places, emotions, tags), compared case-insensitively after Unicode NFC normalization. Same rule on Windows and macOS, so sync can't create a clash.
- Two things legitimately share a name (person "Paris" vs place "Paris"): the second gets a disambiguated filename, `Paris (place).md`, with `Paris` as an alias and the display name in a `title:` field. Autocomplete shows the type icon next to each match, so you pick explicitly; the link stored is the unique filename, e.g. `[[Paris (place)|Paris]]`.
- Aliases must be unique across the vault too. Validation rejects a duplicate alias with a message naming the other note.
- Hand-typed `[[Name]]` resolves by exact filename, then alias. If still ambiguous it shows as unresolved with a "pick one" fix; the app never guesses.
- Date-shaped names (`YYYY-MM-DD`) are reserved for journal day notes.
- Characters illegal in filenames are replaced in the filename; the original is kept in `title:`.
- Emotions in check-ins are stored as the emotion's filename, so renaming an emotion rewrites those too (same rename path as links).

## 5. Architecture

```
React UI (Vite, Tailwind, shadcn, TanStack Router, zod)
  Tiptap editor + suggestion extensions + diff-decoration extension
        │ Tauri commands / events
Rust core
  vault (fs read/write, atomic save, watcher, external-change reconcile)
  markdown/yaml (comment-preserving frontmatter edits)
  schema (types, validation)
  index (SQLite: FTS5, metadata, backlinks; later sqlite-vec)
  git (git2-rs, autocommit, history, restore)
  ai (provider trait: local/cloud; tool contract; edit proposals)
  mcp (stdio/local server exposing journal tools)
```

## 6. Release map

| Release | Theme | Plan file |
|---|---|---|
| 0.1 | Writing core: shell, splash, onboarding, today-first, editor, calendar, paper theme | `release-0.1-writing-core.md` |
| 0.2 | Entities & quick commands (`@ ! # $`), types, index, backlinks | `release-0.2-entities-commands.md` |
| 0.3 | Mood check-in, year heatmap, Git history/autogit | `release-0.3-mood-heatmap-git.md` |
| 0.4 | Search & analytics | `release-0.4-search-analytics.md` |
| 0.5 | AI foundation: providers, privacy, chat sidebar, MCP server | `release-0.5-ai-foundation.md` |
| 0.6 | AI editing: selection menu, surgical edits, accept/reject, multi-session | `release-0.6-ai-editing.md` |
| 0.7 | Retrieval & companion: vectors, proactive prompts, person summaries | `release-0.7-retrieval-companion.md` |
| 0.8 | Sync hardening, dictation, polish | `release-0.8-sync-dictation-polish.md` |
| 0.9 | User-defined types & typed relations | `release-0.9-types-relations.md` |
| Later | Demo journals (Dwight Schrute), Whisper, cloud dictation, GPT/Gem plugins, reranker | `backlog.md` |

Rule: each release is usable daily on its own. Don't start N+1 until N's exit criteria pass.

## 7. Risks (ranked)

1. **Markdown round-trip fidelity** in Tiptap (0.1 gate; fixture corpus).
2. **Inline diff review in WYSIWYG** (de-risk with a throwaway spike during 0.1/0.2).
3. **Synced-folder conflicts** (0.8). Git dir and index are already outside the vault (decided), so remaining risk is conflicting edits to the same day file.
4. **External edits** while a note is open (watcher + reconcile rules, 0.1 basic, 0.8 full).
5. **Local embedding model size/perf** on Windows (0.7).
6. **Scope creep** — each release has a "not in this release" list.

## 8. Workflow note (plan mode vs. Spec Kit/OpenSpec)

For a solo greenfield project, stay with Claude Code plan mode plus these markdown plans: low overhead, and the release plans already act as specs. Spec Kit/OpenSpec pay off with multiple contributors or when you need per-feature audit trails. Suggested compromise: keep a short `CLAUDE.md` in the repo (stack, conventions, "run tests with X"), and for each release, enter plan mode, point at that release's plan file, and have Claude produce a task breakdown before coding. Revisit if plans start drifting from code.

## 9. Open questions to resolve

- Emotions in check-ins vs inline `!sad`: resolved in §4a (stored as filename; rename rewrites both).
- Tauri/Rust YAML: no mature comment-preserving editor in Rust; spike a line-level surgical editor in 0.2.
- One schema source: generate zod from Rust (or the reverse) rather than hand-mirroring.
- Test strategy: synthetic vault generator from 0.2, crash-during-save test, CI.
- Schema/index versioning and migrations; early backup/export; packaging and signing.
- Timezone travel: day = local calendar day, so a flight across zones can shift "today"; accept for now.
- Seeded emotion vocabulary and valence scale (Apple-style 7-step?).
- Licenses of reference repos before code reuse.
- Light/dark: paper theme dark variant ("sepia night")?
- App name/identity: icon, splash art.
