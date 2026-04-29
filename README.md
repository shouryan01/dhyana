# Dhyana

A quiet space for daily reflection. Dhyana is a local-first desktop journaling app with AI-powered analysis, sentiment tracking, and smart tagging.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

## Features

- **Daily journal entries** — one entry per day with a rich markdown editor, auto-saved as you write
- **Rishi AI** — analyzes your entry to generate a summary, sentiment score, and extract people and emotions mentioned
- **Smart tagging** — use `@` to tag people, `#` for emotions/moods, and `$` for custom tags directly in your writing
- **Analytics dashboard** — visualize sentiment trends, most-mentioned people, and mood patterns over 90 days
- **Local-first** — all data stored in a local SQLite database; nothing leaves your machine
- **Dark mode** — full light/dark theme support

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop | [Tauri 2](https://tauri.app) |
| Frontend | React 19, TypeScript, TanStack Router |
| Editor | TipTap 3 |
| Styling | Tailwind CSS 4, Radix UI |
| Charts | Recharts |
| AI | Vercel AI SDK + Google Gemini |
| Database | SQLite (via Tauri SQL plugin) |
| Build | Vite 7, Biome |

## Getting Started

**Prerequisites:** Node.js, pnpm, and the [Rust toolchain](https://rustup.rs)

```bash
# Install dependencies
pnpm install

# Run in development (web only)
pnpm dev

# Run as a desktop app with hot reload
pnpm tauri dev
```

You'll need a Google Gemini API key for Rishi AI. Create a `.env` file in the root:

```
VITE_GEMINI_API_KEY=your_key_here
```

## Build

```bash
# Build the desktop app for your platform
pnpm tauri build
```

Bundles are output to `src-tauri/target/release/bundle/`.

## Other Commands

```bash
pnpm test      # Run tests (Vitest)
pnpm lint      # Lint with Biome
pnpm format    # Format with Biome
```
