# dhyana

AI-powered personal journal: markdown on disk, offline-first, AI entirely optional.

## Where things are
- Plans live in `docs/plans/`. Start with `00-master-plan.md`, then the release file you're working on.
- Work one release at a time; don't start N+1 until N's exit criteria pass.

## Stack
Tauri 2 (Rust core), Vite + React + TypeScript, Tailwind, shadcn/ui, TanStack Router, zod, Tiptap (ProseMirror).

## Rules that matter
- Files are the truth; the index is disposable and lives in app data, not the vault.
- Lossless markdown round-trip: only re-serialize blocks the user edited, splice the rest back unchanged.
- One entry per day file (`journal/YYYY/MM/YYYY-MM-DD.md`); `private: true` is per file.
- AI is optional and never edits without review; no AI code paths active before 0.5.
- Follow the decisions in the master plan (§1, §4, §4a) rather than re-deciding.
- UI should feel like Linear (master principle 9): instant, keyboard-first, every action in the command palette via the shortcut registry.
- Docs: root `README.md` stays short; detail goes in separate `docs/*.md` pages (master §10).

## Commands
- `pnpm install` then `pnpm tauri dev`: desktop app. `pnpm dev`: UI only in a browser (in-memory fake vault).
- `pnpm test`: Vitest (markdown round-trip corpus, shortcuts, dates). `pnpm lint`: ESLint + tsc.
- `cd src-tauri && cargo test` and `cargo clippy --all-targets`: Rust core.
- Round-trip fixtures live in `src/markdown/__fixtures__/`; add a fixture for any new markdown construct.
