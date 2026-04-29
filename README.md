<div align="center">
  <img src="public/logo.png" alt="Dhyana" width="80" />
  <h1>dhyāna</h1>
  <p><strong>A quiet space for daily reflection.</strong></p>
  <p>Local-first journaling with AI-powered analysis, sentiment tracking, and smart tagging — all stored on your machine.</p>

  ![Version](https://img.shields.io/badge/version-0.1.0-blue)
  ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)
  ![License](https://img.shields.io/badge/license-MIT-green)
</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Usage](#usage)
- [Building](#building)
- [Contributing](#contributing)

---

## Overview

Dhyana (धyाना — Sanskrit for meditation) is a desktop journaling app built for people who want a calm, distraction-free space to write. It stays out of your way while you write, then surfaces patterns and insights once you're done.

Everything runs locally. No accounts, no cloud sync, no data sent anywhere except the AI analysis calls you explicitly trigger.

---

## Features

### Writing
- **One entry per day** — focused, distraction-free editor with full Markdown support
- **Auto-save** — changes are persisted automatically as you write with a short debounce
- **Rich text editor** — powered by TipTap with support for headings, lists, links, and more

### Rishi AI

Rishi (ऋषि) is the Sanskrit word for a sage or seer — a witness who observes without judgement. It was chosen because the AI's role is not to evaluate or advise, but simply to reflect back what's already in your writing: who appeared, what you felt, and the overall tone of the entry.

- **Summarization** — generates a concise one-sentence summary of your entry
- **Sentiment analysis** — scores each entry on a -1.0 to +1.0 scale
- **Smart extraction** — identifies people and emotions mentioned in your writing
- Runs automatically 30 seconds after you stop typing

**AI is fully optional.** You can disable Rishi entirely from Settings — no API key required, no outbound calls made. The rest of the app (editor, tagging, analytics) works without it.

### Smart Tagging
Write naturally and use trigger characters to tag inline:

| Character | Purpose |
|---|---|
| `@` | Tag people mentioned in your entry |
| `#` | Track emotions and moods |
| `$` | Custom user-defined tags |
| `/` | Insert Markdown blocks (headings, lists, etc.) |

All trigger characters are configurable in settings.

### Analytics
- **Sentiment trend** — line chart of your mood over the past 90 days
- **People mentions** — bar chart of who appears most in your entries
- **Mood cloud** — frequency visualization of tracked emotions

### Privacy
- All entries stored locally in SQLite — nothing syncs to the cloud
- Rishi AI can be completely disabled in Settings — when off, the app makes zero outbound network calls

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) + Rust |
| Frontend framework | React 19, TypeScript |
| Routing | TanStack Router (file-based) |
| Editor | TipTap 3 |
| Styling | Tailwind CSS 4, Radix UI |
| Charts | Recharts |
| AI | Vercel AI SDK + Google Gemini |
| Database | SQLite via Tauri SQL plugin |
| Build tooling | Vite 7, Biome |
| Runtime | Bun |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) — JavaScript runtime and package manager
- [Rust toolchain](https://rustup.rs) — required for Tauri desktop compilation

### Installation

```bash
git clone https://github.com/shouryan01/dhyana.git
cd dhyana
bun install
```

### Configuration

Rishi AI requires a Google Gemini API key. Create a `.env` file in the project root:

```env
VITE_GEMINI_API_KEY=your_key_here
```

Get a free key at [aistudio.google.com](https://aistudio.google.com).

---

## Usage

**Run the app in development mode:**

```bash
bunx tauri dev
```

**Run the frontend only (browser):**

```bash
bun run dev
```

---

## Building

Build a production desktop app bundle for your current platform:

```bash
bunx tauri build
```

Output bundles (`.dmg`, `.exe`, `.AppImage`, etc.) are placed in `src-tauri/target/release/bundle/`.

**Other commands:**

```bash
bun run test      # Run tests with Vitest
bun run lint      # Lint with Biome
bun run format    # Format with Biome
```

---

## Contributing

Contributions are welcome. Please open an issue before submitting a large pull request so we can discuss the approach.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Commit your changes
4. Push and open a pull request
