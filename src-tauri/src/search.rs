//! Search and analytics reads over the index: FTS5 text plus metadata filters in one query, and
//! the per-day records the analytics dashboard computes from. Everything here is derived data.

use std::collections::HashMap;

use rusqlite::params_from_iter;
use rusqlite::types::Value;
use serde::{Deserialize, Serialize};

use crate::index::{Index, IndexError};
use crate::mood::CheckIn;
use crate::names;

type Result<T> = std::result::Result<T, IndexError>;

/// Matched words in a snippet are wrapped in U+0001 and U+0002 (control characters that never
/// occur in prose); the UI turns them into highlights.
#[cfg(test)]
const HIT_OPEN: char = '\u{1}';

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchQuery {
    /// Free text; every word must appear (the last one may be a prefix).
    pub text: String,
    /// People and places, by note name (what links point at).
    pub people: Vec<String>,
    pub tags: Vec<String>,
    /// Emotion names, matched in check-ins and inline `!emotion`.
    pub emotions: Vec<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    /// Bounds on the day's average valence.
    pub mood_min: Option<f64>,
    pub mood_max: Option<f64>,
    pub limit: Option<usize>,
    /// Leave out `private: true` days (set for everything an AI or MCP client can see).
    #[serde(skip)]
    pub exclude_private: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub date: String,
    pub words: usize,
    pub valence: Option<f64>,
    /// A piece of the entry; matched words are wrapped in `HIT_OPEN`/`HIT_CLOSE`.
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DayLink {
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsDay {
    pub date: String,
    pub words: usize,
    /// `created` from the frontmatter, if the file has one.
    pub created: Option<String>,
    pub body: String,
    pub moods: Vec<CheckIn>,
    pub tags: Vec<String>,
    /// Notes the day links to (people, places, inline emotions), once per mention.
    pub links: Vec<DayLink>,
}

/// An FTS5 MATCH expression from what the user typed: each word quoted, the last as a prefix.
/// Returns `None` when there is nothing searchable.
pub fn match_expr(text: &str) -> Option<String> {
    let words: Vec<String> = text
        .split(|c: char| !c.is_alphanumeric() && c != '\'')
        .map(|w| w.trim_matches('\''))
        .filter(|w| !w.is_empty())
        .map(str::to_string)
        .collect();
    let last = words.len().checked_sub(1)?;
    Some(
        words
            .iter()
            .enumerate()
            .map(|(i, w)| {
                format!(
                    "\"{}\"{}",
                    w.replace('"', ""),
                    if i == last { "*" } else { "" }
                )
            })
            .collect::<Vec<_>>()
            .join(" "),
    )
}

impl Index {
    /// Journal days matching the text and every filter, best match first (newest first when
    /// there is no text).
    pub fn search(&self, q: &SearchQuery) -> Result<Vec<SearchHit>> {
        let expr = match_expr(&q.text);
        let mut args: Vec<Value> = Vec::new();
        let mut cond: Vec<String> = vec!["n.kind = 'journal'".to_string()];

        let mut sql = String::new();
        if let Some(e) = &expr {
            sql.push_str(
                "SELECT n.name, n.words, (SELECT AVG(valence) FROM moods WHERE src = n.path),
                        snippet(fts, 1, char(1), char(2), '…', 18)
                 FROM fts JOIN notes n ON n.path = fts.path",
            );
            cond.push("fts MATCH ?".to_string());
            args.push(Value::Text(e.clone()));
        } else {
            sql.push_str(
                "SELECT n.name, n.words, (SELECT AVG(valence) FROM moods WHERE src = n.path),
                        (SELECT substr(body, 1, 240) FROM fts WHERE fts.path = n.path)
                 FROM notes n",
            );
        }
        if q.exclude_private {
            cond.push("n.private = 0".to_string());
        }
        if let Some(from) = &q.from {
            cond.push("n.name >= ?".into());
            args.push(Value::Text(from.clone()));
        }
        if let Some(to) = &q.to {
            cond.push("n.name <= ?".into());
            args.push(Value::Text(to.clone()));
        }
        for p in &q.people {
            cond.push(
                "EXISTS (SELECT 1 FROM links l WHERE l.src = n.path AND l.target_key = ?)".into(),
            );
            args.push(Value::Text(names::key(p)));
        }
        for t in &q.tags {
            cond.push(
                "EXISTS (SELECT 1 FROM tags t WHERE t.src = n.path AND t.tag_key = ?)".into(),
            );
            args.push(Value::Text(names::key(t)));
        }
        for e in &q.emotions {
            let key = names::key(e);
            cond.push(
                "(EXISTS (SELECT 1 FROM moods m WHERE m.src = n.path AND instr(m.emotion_keys, char(10) || ? || char(10)) > 0)
                  OR EXISTS (SELECT 1 FROM links l WHERE l.src = n.path AND l.target_key = ?))"
                    .into(),
            );
            args.push(Value::Text(key.clone()));
            args.push(Value::Text(key));
        }
        if let Some(min) = q.mood_min {
            cond.push("(SELECT AVG(valence) FROM moods WHERE src = n.path) >= ?".into());
            args.push(Value::Real(min));
        }
        if let Some(max) = q.mood_max {
            cond.push("(SELECT AVG(valence) FROM moods WHERE src = n.path) <= ?".into());
            args.push(Value::Real(max));
        }
        sql.push_str(" WHERE ");
        sql.push_str(&cond.join(" AND "));
        sql.push_str(if expr.is_some() {
            " ORDER BY bm25(fts), n.name DESC"
        } else {
            " ORDER BY n.name DESC"
        });
        sql.push_str(" LIMIT ?");
        args.push(Value::Integer(q.limit.unwrap_or(200).min(1000) as i64));

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(args), |r| {
            let snippet: Option<String> = r.get(3)?;
            Ok(SearchHit {
                date: r.get(0)?,
                words: r.get::<_, i64>(1)? as usize,
                valence: r
                    .get::<_, Option<f64>>(2)?
                    .map(|v| (v * 100.0).round() / 100.0),
                snippet: snippet
                    .unwrap_or_default()
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" "),
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Every journal day with the data the analytics are computed from, oldest first.
    pub fn analytics_days(&self) -> Result<Vec<AnalyticsDay>> {
        let mut by_path: HashMap<String, usize> = HashMap::new();
        let mut days: Vec<AnalyticsDay> = Vec::new();
        {
            let mut stmt = self.conn.prepare(
                "SELECT n.path, n.name, n.words, n.created, IFNULL(f.body, '')
                 FROM notes n LEFT JOIN fts f ON f.path = n.path
                 WHERE n.kind = 'journal' ORDER BY n.name",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    AnalyticsDay {
                        date: r.get(1)?,
                        words: r.get::<_, i64>(2)? as usize,
                        created: r.get(3)?,
                        body: r.get(4)?,
                        moods: Vec::new(),
                        tags: Vec::new(),
                        links: Vec::new(),
                    },
                ))
            })?;
            for row in rows {
                let (path, day) = row?;
                by_path.insert(path, days.len());
                days.push(day);
            }
        }
        {
            let mut stmt = self.conn.prepare(
                "SELECT src, at, valence, emotions, factors FROM moods ORDER BY src, ord",
            )?;
            let rows = stmt.query_map([], |r| {
                let lines = |s: String| -> Vec<String> {
                    s.lines()
                        .filter(|l| !l.is_empty())
                        .map(str::to_string)
                        .collect()
                };
                Ok((
                    r.get::<_, String>(0)?,
                    CheckIn {
                        at: r.get(1)?,
                        valence: r.get(2)?,
                        emotions: lines(r.get(3)?),
                        factors: lines(r.get(4)?),
                    },
                ))
            })?;
            for row in rows {
                let (src, c) = row?;
                if let Some(&i) = by_path.get(&src) {
                    days[i].moods.push(c);
                }
            }
        }
        {
            let mut stmt = self
                .conn
                .prepare("SELECT src, tag FROM tags ORDER BY src, rowid")?;
            for row in
                stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            {
                let (src, tag) = row?;
                if let Some(&i) = by_path.get(&src) {
                    days[i].tags.push(tag);
                }
            }
        }
        {
            // A link's note is found by filename, else by alias; links to nothing (or to day
            // notes, like `$date` events) are not people, places or emotions and are left out.
            let mut stmt = self.conn.prepare(
                "SELECT l.src, t.name, t.kind FROM links l
                 JOIN notes t ON t.path = IFNULL(
                    (SELECT path FROM notes WHERE name_key = l.target_key AND kind != 'journal' LIMIT 1),
                    (SELECT path FROM aliases WHERE alias_key = l.target_key LIMIT 1))
                 WHERE t.kind IN ('person', 'place', 'emotion')
                 ORDER BY l.src, l.ord",
            )?;
            for row in stmt.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })? {
                let (src, name, kind) = row?;
                if let Some(&i) = by_path.get(&src) {
                    days[i].links.push(DayLink { name, kind });
                }
            }
        }
        Ok(days)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn put(v: &std::path::Path, rel: &str, text: &str) {
        let p = v.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    fn vault() -> (tempfile::TempDir, Index) {
        let d = tempdir().unwrap();
        let v = d.path();
        put(v, "people/Alex.md", "---\ntype: person\n---\n");
        put(v, "emotions/sad.md", "---\ntype: emotion\n---\n");
        put(
            v,
            "journal/2026/03/2026-03-02.md",
            "---\ncreated: 2026-03-02T21:10:00+00:00\nmood:\n  - { at: \"09:00\", valence: 0.6, emotions: [calm], factors: [] }\n---\nWalked with [[Alex]] by the river. #outdoors\n",
        );
        put(
            v,
            "journal/2026/03/2026-03-05.md",
            "---\nmood:\n  - { at: \"09:00\", valence: -0.5, emotions: [sad], factors: [] }\n---\nWorking late again, feeling [[sad]]. #work\n",
        );
        let mut idx = Index::open_in_memory().unwrap();
        idx.rebuild(v).unwrap();
        (d, idx)
    }

    #[test]
    fn match_expr_quotes_words_and_prefixes_the_last() {
        assert_eq!(match_expr("walk riv"), Some("\"walk\" \"riv\"*".into()));
        assert_eq!(match_expr("  \"?!\" "), None);
        assert_eq!(match_expr("don't"), Some("\"don't\"*".into()));
    }

    #[test]
    fn text_search_stems_and_highlights() {
        let (_d, idx) = vault();
        let hits = idx
            .search(&SearchQuery {
                text: "walking".into(),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].date, "2026-03-02");
        assert!(hits[0].snippet.contains(HIT_OPEN));
    }

    #[test]
    fn filters_combine() {
        let (_d, idx) = vault();
        let q = |f: &dyn Fn(&mut SearchQuery)| {
            let mut q = SearchQuery::default();
            f(&mut q);
            idx.search(&q)
                .unwrap()
                .into_iter()
                .map(|h| h.date)
                .collect::<Vec<_>>()
        };
        assert_eq!(q(&|q| q.people = vec!["alex".into()]), ["2026-03-02"]);
        assert_eq!(q(&|q| q.tags = vec!["work".into()]), ["2026-03-05"]);
        // Check-in emotion and inline emotion both count.
        assert_eq!(q(&|q| q.emotions = vec!["sad".into()]), ["2026-03-05"]);
        assert_eq!(q(&|q| q.emotions = vec!["calm".into()]), ["2026-03-02"]);
        assert_eq!(q(&|q| q.mood_min = Some(0.0)), ["2026-03-02"]);
        assert_eq!(q(&|q| q.mood_max = Some(0.0)), ["2026-03-05"]);
        assert_eq!(q(&|q| q.from = Some("2026-03-03".into())), ["2026-03-05"]);
        assert_eq!(q(&|q| q.to = Some("2026-03-03".into())), ["2026-03-02"]);
        assert_eq!(q(&|_| {}), ["2026-03-05", "2026-03-02"]);
        assert!(q(&|q| {
            q.text = "late".into();
            q.people = vec!["Alex".into()];
        })
        .is_empty());
    }

    #[test]
    fn analytics_days_carry_moods_tags_and_links() {
        let (_d, idx) = vault();
        let days = idx.analytics_days().unwrap();
        assert_eq!(days.len(), 2);
        assert_eq!(
            days[0].created.as_deref(),
            Some("2026-03-02T21:10:00+00:00")
        );
        assert_eq!(days[0].moods[0].emotions, ["calm"]);
        assert_eq!(days[0].tags, ["outdoors"]);
        assert_eq!(
            days[0].links,
            [DayLink {
                name: "Alex".into(),
                kind: "person".into()
            }]
        );
        assert_eq!(days[1].links[0].kind, "emotion");
    }

    #[test]
    fn three_years_of_entries_load_and_search_quickly() {
        let d = tempdir().unwrap();
        let v = d.path();
        put(v, "people/Alex.md", "---\ntype: person\n---\n");
        let filler =
            "morning coffee walked along the river thinking about work and friends. ".repeat(25);
        let start = chrono::NaiveDate::from_ymd_opt(2023, 1, 1).unwrap();
        for i in 0..1095 {
            let date = start + chrono::Duration::days(i);
            let rel = format!(
                "journal/{}/{}/{}.md",
                date.format("%Y"),
                date.format("%m"),
                date.format("%Y-%m-%d")
            );
            let text = format!(
                "---\ncreated: {}T08:00:00+00:00\nmood:\n  - {{ at: \"09:00\", valence: 0.{}, emotions: [calm], factors: [] }}\n---\n{filler}[[Alex]] #work\n",
                date.format("%Y-%m-%d"),
                i % 10
            );
            put(v, &rel, &text);
        }
        let mut idx = Index::open_in_memory().unwrap();
        idx.rebuild(v).unwrap();

        // The index build is a one-off (and incremental afterwards); what the user waits for is
        // the dashboard's read and a search.
        let t = std::time::Instant::now();
        let days = idx.analytics_days().unwrap();
        let hits = idx
            .search(&SearchQuery {
                text: "river".into(),
                people: vec!["Alex".into()],
                ..Default::default()
            })
            .unwrap();
        let elapsed = t.elapsed();
        assert_eq!(days.len(), 1095);
        assert_eq!(hits.len(), 200); // capped
        assert!(elapsed.as_millis() < 1000, "took {elapsed:?}");
    }

    #[test]
    fn editing_a_day_updates_its_text() {
        let (d, mut idx) = vault();
        put(d.path(), "journal/2026/03/2026-03-02.md", "Only tea now.\n");
        idx.refresh(d.path(), &["journal/2026/03/2026-03-02.md".to_string()])
            .unwrap();
        let hit = |t: &str| {
            idx.search(&SearchQuery {
                text: t.into(),
                ..Default::default()
            })
            .unwrap()
            .len()
        };
        assert_eq!(hit("river"), 0);
        assert_eq!(hit("tea"), 1);
    }
}
