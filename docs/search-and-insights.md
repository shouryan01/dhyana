# Search and insights

Everything here is computed on your machine from your entries. No AI, no network.

## Search

Open it with <kbd>Ctrl/⌘</kbd> <kbd>Shift</kbd> <kbd>F</kbd> (works everywhere), <kbd>/</kbd> (outside the editor), or **Search** at the top of the sidebar. <kbd>Ctrl/⌘</kbd> <kbd>K</kbd> stays the command palette. One line holds the words you're looking for and the filters:

```
walk river @Alex #outdoors !calm in:last-month mood:>0.2
```

| Write                                                                                         | To find                                                                                                                            |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| plain words                                                                                   | entries containing all of them (word forms match: _walking_ finds _walked_; the last word also matches as a prefix while you type) |
| `@Alex`, `@"Mary Ann"`, `person:Alex`                                                         | entries linking to that person or place (aliases work)                                                                             |
| `#work`, `tag:work`                                                                           | entries with that topic                                                                                                            |
| `!calm`, `emotion:calm`                                                                       | entries with that emotion, in a check-in or written inline                                                                         |
| `from:2026-01-01` `to:2026-03-31` `on:2026-03-02`                                             | a date range                                                                                                                       |
| `in:2026`, `in:2026-03`, `in:this-month`, `in:last-month`, `in:this-year`, `in:last-year`     | a period                                                                                                                           |
| `last:30d` (`w`, `m`, `y`)                                                                    | the most recent stretch, up to today                                                                                               |
| `mood:>0.2`, `mood:<-0.2`, `mood:-0.5..0.5`, `mood:positive`, `mood:negative`, `mood:neutral` | days whose average mood is in that range                                                                                           |

Filters combine (all must hold). A name that matches nothing is listed under the bar instead of being guessed. "Entries involving Alex last month" is `@Alex in:last-month`.

**Saved searches.** The bookmark button saves the current line under a name; click a saved search to run it again. They are stored in the vault as `.dhyana/saved-searches.json`, so they sync with the vault.

Private days (`private: true`) are searched like any other: search never leaves your machine.

## Insights

Open it with <kbd>G</kbd> <kbd>I</kbd> or **Insights** in the sidebar. Each section says whether its numbers are **counted** from what you entered or **derived** from it.

- **Consistency** (counted): current and longest streak, entries and words per month, words per day (last 90 days), the hour entries were started (from the file's `created` time; older files without one are noted), and a weekday pattern. The year heatmap is on the [year view](keyboard-shortcuts.md).
- **Mood** (derived): mood over time with a 7-day average, how often each emotion appears (check-ins and inline `!emotions` are counted together; hover a row for the split), mood by time of day and weekday, and which people, places and tags show up on better or worse days compared with your average. These show what appears together, not what causes what, and anything with fewer than 5 days is flagged as a small sample.
- **People and topics**: most-mentioned people and places with a 90-day trend, one person's mentions over time, who appears together, tag frequency, and the words that stood out each month. Those words are picked by frequency (TF-IDF); they're keywords, not topics understood by a model.
- **Writing style** (derived, approximate, English only): vocabulary richness, sentence length, reading level, "I" versus "we", tense mix, question and exclamation rates, a word-list sentiment score, and your longest and shortest entries.

Every bar, dot and row opens the entries behind it: a day, or a search filtered to that month, person, tag or emotion. With too few entries a chart says so rather than drawing a pattern.

## How it works

The search index is the same disposable SQLite database as the rest (in app data, never in the vault). It adds an FTS5 table of each day's text and the `created` time; the index is rebuilt automatically the first time 0.4 opens a vault. The dashboard reads one record per day from the index and computes the numbers in `src/lib/analytics.ts`; the unit tests check them against hand-computed fixtures and time a three-year synthetic journal.
