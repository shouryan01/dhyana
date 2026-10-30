# Getting started

## Prerequisites

- Node 20+ and pnpm
- Rust (stable) via [rustup](https://rustup.rs)
- Tauri's platform prerequisites: on Windows, the MSVC build tools and WebView2 (preinstalled on Windows 11); on macOS, Xcode command line tools. See the [Tauri guide](https://tauri.app/start/prerequisites/).

## Run

```sh
pnpm install
pnpm tauri dev      # the desktop app, with hot reload
pnpm dev            # UI only, in a browser, with an in-memory fake vault (no Rust needed)
```

On first launch the onboarding flow asks where your vault lives (default: `Documents/dhyana`). You can change the vault later in **Settings → Vault → Change…**; that only changes which folder is opened and never moves or deletes files. To see onboarding again, use the developer settings (see [development](development.md)). It ends with a short practice note that walks you through `!`, `@`, `$` and `#` step by step; nothing typed there is saved.

## Test and check

```sh
pnpm test                         # Vitest: markdown round-trip corpus, shortcuts, dates, entities, triggers
pnpm lint                         # Oxlint + tsgo + Oxfmt check
pnpm format                       # Oxfmt: fix formatting
cd src-tauri && cargo test        # Rust: frontmatter, atomic saves, conflicts, index, entities, rename
cd src-tauri && cargo clippy --all-targets
```

## Build

```sh
pnpm tauri build
```

Merging to `main` builds Windows and Apple Silicon installers in CI; see [development](development.md).

## Where things are

| Path                   | What                                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| `src/`                 | React UI (shell, calendar, palette, editor, onboarding, settings)              |
| `src/markdown/`        | The lossless markdown engine (parse, serialize, splice) and its fixture corpus |
| `src/lib/shortcuts.ts` | The shortcut registry and key dispatcher                                       |
| `src-tauri/src/`       | Rust core: vault I/O, frontmatter, entities, SQLite index, settings, watcher   |
| `src/editor/`          | The `@ ! # $` quick-command pickers                                            |
| `docs/plans/`          | Roadmap and per-release plans                                                  |

App settings (vault path, theme, font, onboarding flag) live in the OS app-data folder, not in your vault.
