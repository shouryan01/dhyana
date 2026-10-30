# Release 0.4 — Search & Analytics

Everything here is computed locally from validated data. **No AI required.**

## Search

- FTS5 full-text search + metadata filters (person, tag, emotion, date range, mood range) in one query bar.
- Saved searches / views (SoloMD reference).
- "Entries involving Alex last month" must work through filters, not embeddings.

## Analytics dashboard (charts: Recharts or visx; follow `dataviz` skill guidance)

**Consistency**

- Year heatmap (from 0.3), current/longest streak, entries per month, words per day, time-of-day writing distribution, weekday pattern.

**Mood**

- Valence over time (smoothed), emotion frequency (check-ins and inline `!` shown separately), mood by weekday/time-of-day, calendar mood view.
- **Mood correlations:** average valence when person X / place Y / tag Z appears vs baseline (with sample-size warnings).

**People & topics**

- Most-mentioned people (ranking + trend), mentions over time per person, per-person mood association, co-occurrence network (who appears together), relationship timeline.
- Topics: tag frequency; keyword/TF-IDF top terms per month (clearly labeled keyword-derived). AI topic modeling comes in 0.7, labeled AI-derived.

**Writing style (local, deterministic)**

- Vocabulary richness, avg sentence length, reading level, first-person singular vs plural ratio, tense mix, question/exclamation ratio, sentiment lexicon score (labeled approximate), longest/shortest entries.

## Other ideas worth considering (optional picks)

Word-of-the-year/month, "things you stopped mentioning", gratitude count, mood-vs-sleep factor charts, entry length vs mood, year-in-review page.

## Rules

- Distinguish user-entered data from derived data in UI.
- Every chart has empty-state and small-sample handling; click-through to the source entries.

## Exit criteria

- [ ] Dashboard loads < 1s on 3 years of synthetic data (generate a test vault).
- [ ] Charts clickable to underlying entries.
- [ ] Numbers verified against hand-computed fixtures.
