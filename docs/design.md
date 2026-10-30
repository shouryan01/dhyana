# Design

The app should feel like Linear: instant, quiet, keyboard-first.

## Name and logo

The name is written **dhyāna** (with the macron) wherever users read it. Identifiers, paths and the bundle name stay ASCII (`dhyana`).

The logo is a book with a spark. The source is `public/logo.svg` (a warm tile for icons); `src/components/Logo.tsx` draws the same mark in `currentColor` for in-app use. Platform icons in `src-tauri/icons/` were generated from a 1024 px render with `pnpm tauri icon`. The spark is the common "AI" symbol even though AI is optional in the app; swap it if that becomes confusing.

## Themes

Two families, each with a light and a dark mode:

- **Dhyāna**: warm paper and its softer "sepia night" twin. The default is Dhyāna light.
- **Basic**: neutral greys.

The whole app, sidebar included, follows the theme. Colours are CSS variables in `src/styles/index.css` (`--chrome`, `--surface`, `--accent`, ...) selected by `data-theme` on the root element; settings saved by earlier builds (`paper`, `light`, `dark`, `default-*`) migrate automatically.

First run always starts with Dhyāna light and the serif writing font selected.

## Motion

Short and subtle; none at all when the OS asks for reduced motion.

- `anim-fade` and `anim-pop` for panels and dialogs.
- `transition-spring` for hover and press: colours fade plainly, only transforms get the springy overshoot (overshooting a colour looks like a flash).
- The logo wiggles when its parent (`.group`) is hovered.
- Small, tightly packed controls (the calendar) do not scale on hover.

## Keyboard shortcuts

Shown in the platform's own style: `Ctrl+Shift+T` on Windows and Linux, `⇧⌘T` on macOS (Apple's modifier order, no separators in tooltips). See [keyboard shortcuts](keyboard-shortcuts.md).
