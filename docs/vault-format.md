# Vault format

```
vault/
  journal/2026/10/2026-10-28.md   # one file per day
```

One entry per day. The journal day is the local calendar day. The file is created only when you type the first character.

## Frontmatter

```yaml
---
id: 01J... # stable ULID
type: journal
date: 2026-10-28 # journal date
created: 2026-10-28T07:12:00-05:00 # written once
modified: 2026-10-28T21:40:00-05:00 # last edit made in dhyana
---
```

- dhyana only touches the lines it owns. Comments, key order, and any other keys you add are left alone.
- `modified` changes only when a save changes the content. Opening a note never rewrites it.
- Edits made in other apps don't update `modified`; dhyana doesn't rely on it for sync or conflict detection.
- Files without frontmatter are fine (for example notes created in Obsidian). dhyana adds the keys on the first edit it makes.

## Markdown fidelity

Opening and saving an untouched note doesn't change a byte. When you edit, only the blocks you edited are rewritten; the rest of the file (blank lines, CRLF line endings, list markers, tables, footnotes, raw HTML, comments) is kept exactly as it was. Anything the editor can't represent appears as a dashed, non-editable block and is saved verbatim.

Saves are atomic, and if the file changed on disk while you were editing, dhyana asks before overwriting it.
