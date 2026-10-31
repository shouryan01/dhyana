# Keyboard shortcuts

`Mod` is <kbd>Ctrl</kbd> on Windows and Linux and <kbd>⌘</kbd> on macOS. On macOS modifiers are shown in Apple's order (<kbd>⌃</kbd> <kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>⌘</kbd>), so `Mod Shift T` reads <kbd>⇧⌘T</kbd>. Chords work everywhere. Single keys and sequences (like <kbd>G</kbd> <kbd>T</kbd>) only work when you're **not** typing in the editor; press <kbd>Esc</kbd> to leave it.

| Action                   | Shortcut                                            |
| ------------------------ | --------------------------------------------------- |
| Open command palette     | `Mod K`                                             |
| Go to today              | `G T` or `Mod Shift T`                              |
| Previous / next day      | `Mod [` / `Mod ]` (or `[` / `]` outside the editor) |
| Go to date…              | `Mod G` or `G D`                                    |
| Go to person or place…   | `G P` (also creates one: type a new name)           |
| Open library             | `G L` (everything created so far, click to edit)    |
| Open year view           | `G Y`, or click the year above the calendar         |
| Add mood check-in        | `M` (opens today if no day is open)                 |
| Toggle mood panel        | `G M`                                               |
| Show version history     | `G H` (also the history button, top right)          |
| Save a version now       | palette only                                        |
| Delete this note…        | palette only (moves it to the Trash / Recycle Bin)  |
| Save now                 | `Mod S` (notes also save on their own as you type)  |
| Focus editor             | `I`                                                 |
| Toggle sidebar           | `Mod \`                                             |
| Toggle dark / light mode | `Mod Shift L`                                       |
| Open settings            | `Mod ,` or `G S`                                    |
| Show keyboard shortcuts  | `?`                                                 |
| Rebuild index            | palette only                                        |
| Replay onboarding        | palette only (development builds)                   |
| Theme: Dhyāna / Basic    | palette only                                        |

"Go to date" understands `2026-10-28`, `yesterday`, `tomorrow`, `-3`, `friday`, `next monday`, `last friday`, `in 3 days`, `in 2 weeks`, `next week`, `dec 25`, `25 december`, `12/25` and `dec 25 2027`. A month and day without a year means the next one coming.

## Quick commands in the editor

Type one of these at the start of a line or after a space. A list opens under the cursor: <kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>Enter</kbd> or <kbd>Tab</kbd> to pick, <kbd>Esc</kbd> to close it (a second <kbd>Esc</kbd> leaves the editor). Typing past what makes sense (a sentence after `@`, or `$5`) closes the list without getting in the way. Picking an item adds a space after it so you can keep typing.

| Type | Offers                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `@`  | People and places, most recent and most mentioned first; found by name. "Create…" if new. New people and places are written in lowercase. |
| `!`  | Emotions, shown as chips.                                                                                                                 |
| `#`  | Topic tags in use, or "Create tag".                                                                                                       |
| `$`  | A date in plain words ("next friday", "dec 25"). Inserts a link to that day.                                                              |

Click a person, place or emotion chip to open its page; click a date chip to open that day. See [vault format](vault-format.md) for what ends up in the file.

In the mood check-in, use the arrow keys (or <kbd>Home</kbd> / <kbd>End</kbd>) on the slider, <kbd>Enter</kbd> to go to the next step, and <kbd>Esc</kbd> to skip. In the year view, arrow keys move between days and <kbd>Enter</kbd> opens one.

The same list is shown on the shortcuts page (**Settings → Keyboard shortcuts → View all**, or press <kbd>?</kbd>), generated from the app's action registry. Remapping arrives in 0.8.
