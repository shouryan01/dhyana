# dhyana

A quiet, offline-first journal. Your entries are plain markdown files in a folder you choose; AI is optional and not part of this release.

![Writing in dhyana](docs/images/write.png)

- **Opens to today.** One note per day, created only when you start typing.
- **Plain files.** `journal/2026/10/2026-10-28.md`: readable in Obsidian, VS Code, anywhere.
- **Lossless.** Your markdown is never reformatted. Only the parts you edit change.
- **Keyboard-first.** Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> for everything.

<p>
  <img src="docs/images/palette.png" width="49%" alt="Command palette" />
  <img src="docs/images/dark.png" width="49%" alt="Dhyana dark theme" />
</p>

## Quick start

Requires [Node 20+](https://nodejs.org), [pnpm](https://pnpm.io), and [Rust](https://rustup.rs) (plus the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS).

```sh
pnpm install
pnpm tauri dev
```

Pick a vault folder on first launch, then start writing.

## Learn more

| | |
|---|---|
| [Getting started](docs/getting-started.md) | Install, run, test, build |
| [Keyboard shortcuts](docs/keyboard-shortcuts.md) | Every shortcut |
| [Vault format](docs/vault-format.md) | Files, frontmatter, markdown fidelity |
| [Mobile](docs/mobile.md) | Capture on your phone with Obsidian |
| [Tech stack](docs/tech-stack.md) · [Architecture](docs/architecture.md) | How it's built |
| [Plans](docs/plans/00-master-plan.md) | Roadmap and decisions |
