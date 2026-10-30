# Vault format

```
vault/
  journal/2026/10/2026-10-28.md   # one file per day
  people/Alice.md                 # type: person
  places/Paris (place).md         # type: place
  emotions/sad.md                 # type: emotion (a starter set is written on first open)
  tags/gratitude.md               # type: tag (only for tags you create from the # picker)
  notes/Reading list.md           # type: note (a plain note, created by clicking an unresolved [[link]])
  types/person.md                 # definitions of the built-in types
```

One entry per day. The journal day is the local calendar day. The file is created only when you type the first character. Everything else in the vault is a plain markdown note you can open in any editor.

## Frontmatter

```yaml
---
id: 01J... # stable ULID
type: journal
date: 2026-10-28 # journal date
created: 2026-10-28T07:12:00-05:00 # written once
modified: 2026-10-28T21:40:00-05:00 # last edit made in dhyana
mood: # check-ins, written by the mood check-in
  - { at: "07:12", valence: 0.4, emotions: [calm, hopeful], factors: [work] }
---
```

- dhyana only touches the lines it owns. Comments, key order, and any other keys you add are left alone.
- `modified` changes only when a save changes the content. Opening a note never rewrites it.
- Edits made in other apps don't update `modified`; dhyana doesn't rely on it for sync or conflict detection.
- Files without frontmatter are fine (for example notes created in Obsidian). dhyana adds the keys on the first edit it makes.

### Mood check-ins

Each check-in is one item in the `mood:` list:

| Key        | Value                                                                                                                                                                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at`       | Local time, `"HH:MM"`.                                                                                                                                                                                                                                                                               |
| `valence`  | From `-1` (very unpleasant) to `1` (very pleasant), two decimals. The UI names seven equal steps, like Apple Health.                                                                                                                                                                                 |
| `emotions` | Emotion **filenames** from `emotions/` (so renaming an emotion rewrites them, like links). Optional.                                                                                                                                                                                                 |
| `factors`  | What's having the biggest impact: `health`, `fitness`, `self-care`, `hobbies`, `identity`, `spirituality`, `community`, `dating`, `family`, `friends`, `partner`, `tasks`, `weather`, `work`, `education`, `current-events`, `travel`, `money`. Optional; other words are kept and shown as written. |

- dhyana writes each new check-in as one line. Editing or deleting one rewrites only that item; the others (including ones written by hand as a block list, keys dhyana doesn't know, and comments) stay as they were.
- A check-in on its own never creates the day's file. Until you type the first character it is kept in the app's data folder, and it is written into the frontmatter when the note is created. Quitting in between doesn't lose it.
- The check-in is offered once a day, the first time you open today's note (Settings → Mood). Which days it was offered is remembered per device in the app's data folder.
- Inline `!sad` chips in the text are separate from check-ins.

## People, places and emotions

Each is a note in its own folder. Properties live in frontmatter, free text goes below it:

```yaml
---
id: 01J...
type: person
aliases: [Ali, Al] # optional, from other apps: dhyana honours it but never writes or shows it
relationship: friend # free text
birthday: 1990-05-02
title: Alice Smith # only when the display name can't be the filename
created: 2026-10-28T07:12:00-05:00
---
Notes about Alice go here.
```

Editing a property rewrites just that line, so your comments and the order of keys survive. The same goes for `aliases`: a list written as `[a, b]` stays inline and one written with `- a` lines stays a block.

### Names

- A note's filename is its name, and it is unique across the whole vault (people, places, emotions and tags together), ignoring case and Unicode form. That way a synced folder can't end up with two files that differ only by case.
- If a person and a place share a name, the second quietly gets a filename of `Paris (place).md` with `title: Paris`. You only ever see "Paris", with the person or place icon beside it; the link stored is `[[Paris (place)|Paris]]`.
- Characters that are illegal in filenames (`/ \ : * ? " < > |` and the wikilink characters `[ ] # ^`) are replaced with `-` in the filename; the name you typed is kept in `title:`.
- Names that look like a date (`2026-12-25`) are reserved for journal days.
- Renaming a note moves the file and rewrites `[[links]]` to it in every other note. Labels (`[[Alice|Ali]]`) and anchors (`[[Alice#plans]]`) are kept, and so is everything else in those files. Links written through an alias are left as they are, since the alias still works. Tags can't be renamed yet. In the Library you can rename or delete any person, place, emotion or note; deleting moves the file to the Trash / Recycle Bin and leaves links to it as they are (shown as unresolved).

## Inline syntax

Typing one of these at the start of a line or after a space opens a picker. The result is plain text that any markdown app can read.

| You type     | The file gets                 | Notes                                                                |
| ------------ | ----------------------------- | -------------------------------------------------------------------- |
| `@Ali`       | `[[Alice]]`                   | People and places, found by name; "Create person…" inline.           |
| `!sad`       | `[[sad]]`                     | An emotion from `emotions/`, shown as a chip.                        |
| `#gratitude` | `#gratitude`                  | A topic tag. Picking "Create tag" also adds `tags/gratitude.md`.     |
| `$next fri`  | `[[2026-10-30\|Fri, Oct 30]]` | A link to that day's note; the text after `\|` is the event's title. |

`![[embeds]]` and anything inside code are never treated as links or tags. A `[[link]]` that matches a filename (or an `aliases:` entry written by another app) resolves to that note; if it matches nothing it is shown as unresolved, and dhyana never guesses. Clicking an unresolved link creates a plain note of that name in `notes/` and opens it. People and places are made with `@`.

## The index

Backlinks ("mentions"), the tag list and upcoming dates come from a small SQLite index that dhyana builds from your files. It lives in the app's data folder (named after the vault), never inside the vault, and holds nothing the files don't. It is kept up to date as files change, including changes made in other apps. If it ever looks wrong, run **Rebuild index** from the command palette; deleting the index file does the same on the next launch.

## Version history

dhyana keeps a history of your notes with Git, in a repository in the app's data folder (named after the vault), never inside the vault. Your vault gets no `.git` folder, and if it already has one (because you use Git yourself), dhyana never reads or changes it: hidden folders like `.git`, `.obsidian` and `.dhyana` are left out of the history.

- A version is saved about 20 seconds after you stop writing, again every five minutes if you never stop, and when you quit. Nothing is squashed or replaced, so a note's history is the full stream of what it was at each pause, and an open history list adds new versions as they arrive.
- **Save a version now** (command palette or Settings → History) records one that later saves won't fold into.
- Each note's history (the `Actions` list under its title, or `G H`) lists its versions with a read-only diff, either of what that version changed or compared with the note now. **Restore** puts the note back; what was there is saved as a version first, so restoring never loses anything. A restored day that is open in the editor reloads; if you had unsaved typing, you're asked which to keep.
- Settings → History turns automatic versions off. Files larger than 20 MB are left out.

## Markdown fidelity

Opening and saving an untouched note doesn't change a byte. When you edit, only the blocks you edited are rewritten; the rest of the file (blank lines, CRLF line endings, list markers, tables, footnotes, raw HTML, comments) is kept exactly as it was. Anything the editor can't represent appears as a dashed, non-editable block and is saved verbatim.

Saves are atomic, and if the file changed on disk while you were editing, dhyana asks before overwriting it.
