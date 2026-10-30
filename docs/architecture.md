# Architecture

```mermaid
flowchart TB
  subgraph UI["React UI (webview)"]
    Shell["Shell: sidebar, calendar, command palette"]
    Editor["Tiptap editor"]
    MD["Markdown engine<br/>parse · serialize · splice"]
    Reg["Shortcut registry"]
    Backend["Backend interface (zod-validated)"]
    Shell --> Reg
    Editor --> MD
    Editor --> Backend
    Shell --> Backend
  end
  subgraph Core["Rust core"]
    Cmd["Tauri commands"]
    Vault["vault: read, atomic save, delete to trash, list"]
    FM["frontmatter: surgical timestamp edits"]
    Set["settings (app data)"]
    Watch["watcher (notify)"]
    Cmd --> Vault --> FM
    Cmd --> Set
    Watch -->|"vault://changed"| Backend
  end
  Backend -->|"invoke"| Cmd
  Vault <--> Files[("vault/journal/YYYY/MM/YYYY-MM-DD.md")]
  Watch --> Files
```

## Responsibilities

- **Markdown engine** (`src/markdown/`): turns a note body into an editor document and remembers the exact source of every top-level block. On save, blocks that are unchanged are spliced back byte-for-byte; only edited blocks are re-serialized. Constructs the editor has no node for (tables, footnotes, raw HTML, AI blocks) are carried as opaque blocks.
- **Rust core** (`src-tauri/`): owns the files. Splits frontmatter from body, updates only the `modified` line, writes atomically (temp file + rename), refuses to overwrite a file that changed on disk (hash check), and reports external changes through the watcher.
- **Backend interface** (`src/lib/backend.ts`): the only way the UI touches the core. Outside Tauri (plain `pnpm dev`) an in-memory implementation is used instead.
- **Shortcut registry** (`src/lib/shortcuts.ts`, `src/app/actions.ts`): one list of actions feeds the palette, tooltips, the shortcuts page, and the key handler.

Principles are in the [master plan](plans/00-master-plan.md#2-principles): files are the truth, lossless round-trip, AI optional.
