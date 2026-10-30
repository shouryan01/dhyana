# Architecture

```mermaid
flowchart TB
  subgraph UI["React UI (webview)"]
    Shell["Shell: sidebar, calendar, command palette"]
    Editor["Tiptap editor<br/>+ @ ! # $ triggers"]
    Pages["Entity pages, upcoming dates"]
    MD["Markdown engine<br/>parse · serialize · splice"]
    Reg["Shortcut registry"]
    Backend["Backend interface (zod-validated)"]
    Shell --> Reg
    Editor --> MD
    Editor --> Backend
    Pages --> Backend
    Shell --> Backend
  end
  subgraph Core["Rust core"]
    Cmd["Tauri commands"]
    Vault["vault: read, atomic save, delete to trash, list"]
    Ent["entities: create, edit, rename, seed"]
    FM["frontmatter + yaml: line-level edits"]
    Idx["index (SQLite, app data):<br/>notes · aliases · links · tags"]
    Set["settings (app data)"]
    Watch["watcher (notify)"]
    Cmd --> Vault --> FM
    Cmd --> Ent --> FM
    Ent --> Idx
    Cmd --> Idx
    Cmd --> Set
    Watch --> Idx
    Watch -->|"vault://changed, vault://entities"| Backend
  end
  Backend -->|"invoke"| Cmd
  Vault <--> Files[("vault/journal, people, places,<br/>emotions, tags, types")]
  Ent <--> Files
  Idx -. "rebuilt from" .-> Files
  Watch --> Files
```

## Responsibilities

- **Markdown engine** (`src/markdown/`): turns a note body into an editor document and remembers the exact source of every top-level block. On save, blocks that are unchanged are spliced back byte-for-byte; only edited blocks are re-serialized. Constructs the editor has no node for (tables, footnotes, raw HTML, AI blocks) are carried as opaque blocks. `[[wikilinks]]` are inline atoms.
- **Editor triggers** (`src/editor/`): the `@ ! # $` pickers as one Tiptap extension. What each offers is a set of pure functions (`suggest.ts`) so it can be tested without an editor.
- **Rust core** (`src-tauri/`): owns the files. Splits frontmatter from body, edits single frontmatter lines (never re-emitting YAML), writes atomically (temp file + rename), refuses to overwrite a file that changed on disk (hash check), and reports external changes through the watcher.
- **Entities** (`entities.rs`, `names.rs`, `links.rs`): people, places, emotions and tags are notes. Creating, editing and renaming them follows the name rules in the [master plan](plans/00-master-plan.md#4a-name-collisions-decided); rename rewrites links with the same scanner the index uses.
- **Index** (`index.rs`): a SQLite file in app data, keyed by vault id. It is derived entirely from the files, brought up to date on launch, and refreshed per file by the watcher and after saves. Deleting it loses nothing.
- **Backend interface** (`src/lib/backend.ts`): the only way the UI touches the core. Outside Tauri (plain `pnpm dev`) an in-memory implementation is used instead, with the same name rules and link scanning (`memoryBackend.ts`, `memoryEntities.ts`).
- **Schema layer** (`src/lib/schema.ts`): zod types for built-in note types and for everything that crosses the Rust boundary. Rust validates the same rules when writing.
- **Shortcut registry** (`src/lib/shortcuts.ts`, `src/app/actions.ts`): one list of actions feeds the palette, tooltips, the shortcuts page, and the key handler.

Principles are in the [master plan](plans/00-master-plan.md#2-principles): files are the truth, lossless round-trip, AI optional.
