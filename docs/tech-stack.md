# Tech stack

| Layer       | Choice                                                          | Why                                                             |
| ----------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Shell       | Tauri 2 (Rust)                                                  | Small native app, real filesystem access, portable core         |
| UI          | Vite + React + TypeScript                                       | Fast iteration, strict types                                    |
| Styling     | Tailwind CSS 4, shadcn/ui on Base UI (+ cmdk, react-day-picker) | Linear-like feel with design tokens                             |
| Routing     | TanStack Router (hash history)                                  | Typed routes; hash history survives reloads in the packaged app |
| Validation  | zod                                                             | Validates everything crossing the Rust/TS boundary              |
| Editor      | Tiptap (ProseMirror), WYSIWYG only                              | Always editable; schema-level control for surgical edits later  |
| Markdown    | unified / remark-parse / remark-gfm                             | Source positions power the lossless splice                      |
| Rust crates | `notify` (watcher), `chrono`, `ulid`, `sha2`, `serde`           | File watching, timestamps, ids, hashing                         |
| Tooling     | Oxlint, Oxfmt, tsgo, pnpm                                       | One fast toolchain; see [development](development.md)           |
| Tests       | Vitest, `cargo test`                                            | Round-trip corpus and file-safety tests                         |

Later releases add SQLite (index), `git2-rs` (history), and AI providers; see the [master plan](plans/00-master-plan.md).
