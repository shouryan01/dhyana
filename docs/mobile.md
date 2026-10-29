# Mobile

dhyana is a desktop app. To capture notes on your phone, use [Obsidian](https://obsidian.md) (or any markdown editor) on the same vault folder.

## Setup

1. Put your vault folder somewhere that syncs to your phone (iCloud Drive, OneDrive, Google Drive via a folder-sync app, Syncthing...). The sync is up to you; dhyana only needs the folder.
2. In Obsidian, open that folder as a vault.
3. Enable the **Daily notes** core plugin and set:
   - **Date format:** `YYYY/MM/YYYY-MM-DD`
   - **New file location:** `journal`

   Today's note then lands at `journal/2026/10/2026-10-28.md`, the same file dhyana opens.

## Good to know

- Notes created in Obsidian have no frontmatter. That's fine: dhyana reads the date from the filename and adds `id`, `created` and `modified` the first time you edit the note.
- `[[wikilinks]]` and `#tags` are plain text in both apps.
- If you edit the same day on phone and desktop before they sync, your sync tool may create a conflicted copy. dhyana already warns before overwriting a file that changed on disk; full conflict handling is planned for 0.8.
