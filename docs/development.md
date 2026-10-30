# Development

How the project is checked, built and shipped. For setup see [getting started](getting-started.md); for the code layout see [architecture](architecture.md).

## Toolchain

| Job         | Tool                                           | Config                                        |
| ----------- | ---------------------------------------------- | --------------------------------------------- |
| Lint        | [Oxlint](https://oxc.rs) (+ `oxlint-tsgolint`) | `.oxlintrc.json`                              |
| Format      | Oxfmt (Prettier-compatible output)             | `.oxfmtrc.json`                               |
| Type check  | `tsgo` (TypeScript native preview)             | `tsconfig.json`                               |
| Tests       | Vitest, `cargo test`                           | `vite.config.ts`                              |
| Dev / build | Vite 8, Tauri 2                                | `vite.config.ts`, `src-tauri/tauri.conf.json` |
| Packages    | pnpm                                           | `pnpm-lock.yaml`                              |

```sh
pnpm lint      # oxlint, then tsgo --noEmit, then oxfmt --check (this is what CI runs)
pnpm format    # oxfmt: rewrite files to the house style
pnpm test      # Vitest
```

Notes:

- Oxlint runs the `correctness` category plus the React hooks rules. The React Compiler rules (`react/refs`, `react/set-state-in-effect`) are off on purpose: the editor's save logic keeps its state in refs and we don't use the compiler.
- Suppress a rule on one line with `// oxlint-disable-next-line <rule>` and say why.
- `tsgo` is a preview build. If it ever disagrees with `tsc`, trust `tsc` and note the difference.
- Formatting is not a style debate: run `pnpm format`, commit the result.

## Branches and releases

- Work one release at a time on a `release/<version>-<name>` branch; patches go on `release/<version>-patch`.
- A pull request into `main` is the unit of release. Merging it triggers the build below.

## CI and builds

`.github/workflows/build.yml` runs on every push to `main` (which is what a PR merge is) and can be started by hand from the Actions tab.

1. **Lint & test** runs once on Linux (`pnpm lint`, `pnpm test`). It gates the builds.
2. **Build** runs in parallel for **Windows (x64)** and **macOS (Apple Silicon)** with `tauri-action`, and uploads the installers (`.msi`, `.exe`, `.dmg`) as run artifacts. Intel Macs are not supported.

Builds are **unsigned**: Windows shows a SmartScreen warning and macOS needs right-click → Open. Signing needs certificates added as repository secrets.

Rust tests (`cargo test`, `cargo clippy`) are not in CI yet.

## Developer settings

Development builds (`pnpm dev`, `pnpm tauri dev`) add a **Developer** section to Settings. It never exists in production builds (it is gated on `import.meta.env.DEV`, so it is compiled out).

- **Always show onboarding**: open onboarding on every launch.
- **Hold splash screen**: keep the splash up for two seconds.
- **Preview now**: show the splash or onboarding immediately.

These live in the browser's `localStorage` (`dhyana.dev`), not in the app settings file. Replaying onboarding is also in the command palette in dev builds only.

## Window chrome

The window is frameless. Windows and Linux use `decorations: false` (set in `tauri.windows.conf.json` / `tauri.linux.conf.json`) and draw their own minimise / maximise / close buttons (`src/components/TitleBar.tsx`). macOS keeps the native traffic lights, overlaid on the left via `titleBarStyle: "Overlay"`. Draggable areas use `data-tauri-drag-region`.

Anything new that is a window action needs its permission added to `src-tauri/capabilities/default.json`.

## Conventions

- The UI talks to the core only through `src/lib/backend.ts`. Add a method to the interface, the Tauri implementation and the in-memory one together.
- Every user action goes in the shortcut registry (`src/app/actions.ts`), so it appears in the command palette and the shortcuts page.
- Notes are never hard-deleted: deleting moves the file to the OS trash.
- Validate anything crossing the Rust/TypeScript boundary with zod.
- Add a round-trip fixture in `src/markdown/__fixtures__/` for any new markdown construct.
