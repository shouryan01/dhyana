//! The one AI tool contract. The chat sidebar's retrieval and the MCP server both call
//! `Tools::call`, which reads through the same index and vault code as the UI.
//!
//! Privacy is enforced here, once: a `private: true` day, or one outside the folder allow list,
//! never appears in any result (not as an entry, a search snippet, a mention, or a count).

use std::fs;
use std::path::Path;

use serde_json::{json, Value};

use super::settings::AiSettings;
use crate::frontmatter;
use crate::index::Index;
use crate::mood;
use crate::names::{self, Kind};
use crate::search::SearchQuery;
use crate::vault::{day_path, validate_date};

pub struct Tools<'a> {
    pub vault: &'a Path,
    pub index: &'a Index,
    pub settings: &'a AiSettings,
}

/// A tool's result plus the journal days whose text it contains (for source chips and the log).
pub struct ToolOutput {
    pub value: Value,
    pub dates: Vec<String>,
}

const MAX_BODY_CHARS: usize = 20_000;

/// Tool definitions in MCP shape (`name`, `description`, `inputSchema`).
pub fn definitions() -> Vec<Value> {
    let filters = json!({
        "from": {"type": "string", "description": "Earliest date, YYYY-MM-DD"},
        "to": {"type": "string", "description": "Latest date, YYYY-MM-DD"},
        "person": {"type": "string", "description": "Only days that mention this person or place"},
        "tag": {"type": "string", "description": "Only days using this #tag"},
        "emotion": {"type": "string", "description": "Only days with this emotion"},
        "mood_min": {"type": "number", "description": "Minimum average mood, -1 to 1"},
        "mood_max": {"type": "number", "description": "Maximum average mood, -1 to 1"},
        "limit": {"type": "integer", "description": "Maximum results (default 20, at most 100)"}
    });
    let mut search_props = filters.as_object().cloned().unwrap_or_default();
    search_props.insert(
        "text".into(),
        json!({"type": "string", "description": "Words to look for (every word must appear)"}),
    );
    vec![
        json!({
            "name": "read_entry",
            "description": "Read one journal day by date, or a person/place/note by name. Private days are not available.",
            "inputSchema": {"type": "object", "properties": {
                "date": {"type": "string", "description": "Journal date, YYYY-MM-DD"},
                "name": {"type": "string", "description": "Name of a person, place or note"}
            }}
        }),
        json!({
            "name": "list_entries",
            "description": "List journal days (newest first) matching optional filters.",
            "inputSchema": {"type": "object", "properties": filters}
        }),
        json!({
            "name": "search",
            "description": "Full-text search across journal days, best match first, with optional filters.",
            "inputSchema": {"type": "object", "properties": search_props, "required": ["text"]}
        }),
        json!({
            "name": "get_person",
            "description": "A person or place: aliases, relationship, their note, and the journal days that mention them.",
            "inputSchema": {"type": "object", "properties": {
                "name": {"type": "string"}
            }, "required": ["name"]}
        }),
        json!({
            "name": "list_people",
            "description": "People and places, most mentioned first.",
            "inputSchema": {"type": "object", "properties": {
                "kind": {"type": "string", "enum": ["person", "place"]}
            }}
        }),
        json!({
            "name": "propose_edit",
            "description": "Not available yet: editing arrives in a later release. Nothing is changed.",
            "inputSchema": {"type": "object", "properties": {}}
        }),
    ]
}

fn str_arg(args: &Value, key: &str) -> Option<String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn clip(s: &str) -> String {
    if s.chars().count() <= MAX_BODY_CHARS {
        return s.to_string();
    }
    let cut: String = s.chars().take(MAX_BODY_CHARS).collect();
    format!("{cut}\n[…cut]")
}

fn unmark(s: &str) -> String {
    s.chars()
        .filter(|c| *c != '\u{1}' && *c != '\u{2}')
        .collect()
}

fn day_rel(date: &str) -> String {
    format!("journal/{}/{}/{date}.md", &date[..4], &date[5..7])
}

impl Tools<'_> {
    pub fn call(&self, name: &str, args: &Value) -> Result<ToolOutput, String> {
        match name {
            "read_entry" => self.read_entry(args),
            "list_entries" => self.list_entries(args, false),
            "search" => self.list_entries(args, true),
            "get_person" => self.get_person(args),
            "list_people" => self.list_people(args),
            "propose_edit" => Err(
                "propose_edit is not available yet (editing arrives in 0.6). Nothing was changed."
                    .into(),
            ),
            other => Err(format!("unknown tool '{other}'")),
        }
    }

    /// A day the AI may see: exists, not private, inside the allow list.
    pub fn visible_day(&self, date: &str) -> Result<bool, String> {
        let rel = day_rel(date);
        if !self.settings.path_allowed(&rel) {
            return Ok(false);
        }
        let private: Option<i64> = self
            .index
            .conn
            .query_row("SELECT private FROM notes WHERE path = ?1", [&rel], |r| {
                r.get(0)
            })
            .ok();
        Ok(private == Some(0))
    }

    fn read_entry(&self, args: &Value) -> Result<ToolOutput, String> {
        if let Some(date) = str_arg(args, "date") {
            validate_date(&date).map_err(|e| e.to_string())?;
            // Missing, private and outside-the-allow-list all look the same.
            if !self.visible_day(&date)? {
                return Err(format!("no entry available for {date}"));
            }
            let d = validate_date(&date).map_err(|e| e.to_string())?;
            let text = fs::read_to_string(day_path(self.vault, d))
                .map_err(|_| format!("no entry available for {date}"))?;
            let s = frontmatter::split(&text);
            let moods = mood::read(s.block);
            return Ok(ToolOutput {
                value: json!({"date": date, "text": clip(s.body.trim()), "moodCheckIns": moods}),
                dates: vec![date],
            });
        }
        if let Some(name) = str_arg(args, "name") {
            let (path, kind) = self.find_note(&name)?;
            let text = fs::read_to_string(self.vault.join(&path)).map_err(|e| e.to_string())?;
            let s = frontmatter::split(&text);
            return Ok(ToolOutput {
                value: json!({"name": name, "kind": kind, "text": clip(s.body.trim())}),
                dates: vec![],
            });
        }
        Err("read_entry needs a date or a name".into())
    }

    /// An entity-like note (not a journal day) by filename or alias.
    fn find_note(&self, name: &str) -> Result<(String, String), String> {
        let key = names::key(name);
        let row: Option<(String, String)> = self
            .index
            .conn
            .query_row(
                "SELECT path, kind FROM notes WHERE kind <> 'journal' AND (name_key = ?1 OR title_key = ?1
                   OR path IN (SELECT path FROM aliases WHERE alias_key = ?1))
                 ORDER BY (name_key = ?1) DESC LIMIT 1",
                [&key],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();
        row.filter(|(p, _)| self.settings.path_allowed(p))
            .ok_or_else(|| format!("no note named '{name}'"))
    }

    fn query_from(&self, args: &Value, with_text: bool) -> SearchQuery {
        let list = |k: &str| str_arg(args, k).into_iter().collect::<Vec<_>>();
        SearchQuery {
            text: if with_text {
                str_arg(args, "text").unwrap_or_default()
            } else {
                String::new()
            },
            people: list("person"),
            tags: list("tag"),
            emotions: list("emotion"),
            from: str_arg(args, "from"),
            to: str_arg(args, "to"),
            mood_min: args.get("mood_min").and_then(Value::as_f64),
            mood_max: args.get("mood_max").and_then(Value::as_f64),
            limit: Some(1000),
            exclude_private: true,
        }
    }

    fn list_entries(&self, args: &Value, with_text: bool) -> Result<ToolOutput, String> {
        if with_text && str_arg(args, "text").is_none() {
            return Err("search needs some text".into());
        }
        let limit = args
            .get("limit")
            .and_then(Value::as_u64)
            .unwrap_or(20)
            .clamp(1, 100) as usize;
        let hits = self
            .index
            .search(&self.query_from(args, with_text))
            .map_err(|e| e.to_string())?;
        let mut dates = Vec::new();
        let mut out = Vec::new();
        for h in hits {
            if out.len() >= limit {
                break;
            }
            if !self.settings.path_allowed(&day_rel(&h.date)) {
                continue;
            }
            dates.push(h.date.clone());
            out.push(json!({
                "date": h.date, "words": h.words, "mood": h.valence, "snippet": unmark(&h.snippet)
            }));
        }
        Ok(ToolOutput {
            value: json!({ "entries": out }),
            dates,
        })
    }

    /// Visible journal days that link to a person/place note (by name or alias):
    /// `(date, context)`, newest first.
    fn day_mentions(&self, path: &str) -> Result<Vec<(String, String)>, String> {
        let mut stmt = self
            .index
            .conn
            .prepare(
                "SELECT j.path, j.name, l.context FROM links l JOIN notes j ON j.path = l.src
                 JOIN notes t ON t.path = ?1
                 WHERE j.kind = 'journal' AND j.private = 0
                   AND (l.target_key = t.name_key
                        OR l.target_key IN (SELECT alias_key FROM aliases WHERE path = t.path))
                 ORDER BY j.name DESC, l.ord",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([path], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            let (p, date, ctx) = r.map_err(|e| e.to_string())?;
            if self.settings.path_allowed(&p) {
                out.push((date, ctx));
            }
        }
        Ok(out)
    }

    fn get_person(&self, args: &Value) -> Result<ToolOutput, String> {
        let name = str_arg(args, "name").ok_or("get_person needs a name")?;
        let (path, kind) = self.find_note(&name)?;
        if kind != "person" && kind != "place" {
            return Err(format!("'{name}' is not a person or place"));
        }
        let text = fs::read_to_string(self.vault.join(&path)).map_err(|e| e.to_string())?;
        let s = frontmatter::split(&text);
        let (relationship, birthday) = self.index.props(&path).map_err(|e| e.to_string())?;
        let aliases: Vec<String> = {
            let mut stmt = self
                .index
                .conn
                .prepare("SELECT alias FROM aliases WHERE path = ?1 ORDER BY rowid")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([&path], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            rows.filter_map(Result::ok).collect()
        };
        let mentions = self.day_mentions(&path)?;
        let mut days: Vec<&String> = mentions.iter().map(|m| &m.0).collect();
        days.dedup();
        let dates: Vec<String> = days.iter().take(20).map(|d| (*d).clone()).collect();
        let recent: Vec<Value> = mentions
            .iter()
            .take(20)
            .map(|(d, c)| json!({"date": d, "context": c}))
            .collect();
        Ok(ToolOutput {
            value: json!({
                "name": name, "kind": kind, "aliases": aliases,
                "relationship": relationship, "birthday": birthday,
                "note": clip(s.body.trim()),
                "mentionedOnDays": days.len(),
                "firstMentioned": days.last(), "lastMentioned": days.first(),
                "recentMentions": recent,
            }),
            dates,
        })
    }

    fn list_people(&self, args: &Value) -> Result<ToolOutput, String> {
        let only = str_arg(args, "kind").and_then(|k| Kind::parse(&k));
        let mut stmt = self
            .index
            .conn
            .prepare(
                "SELECT path, kind, name FROM notes WHERE kind IN ('person','place') ORDER BY name",
            )
            .map_err(|e| e.to_string())?;
        let rows: Vec<(String, String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        let mut out = Vec::new();
        for (path, kind, name) in rows {
            if only.is_some_and(|k| k.as_str() != kind) || !self.settings.path_allowed(&path) {
                continue;
            }
            let mut days: Vec<String> =
                self.day_mentions(&path)?.into_iter().map(|m| m.0).collect();
            days.dedup();
            out.push((
                days.len(),
                json!({"name": name, "kind": kind, "days": days.len(), "last": days.first()}),
            ));
        }
        out.sort_by_key(|o| std::cmp::Reverse(o.0));
        Ok(ToolOutput {
            value: json!({"people": out.into_iter().map(|o| o.1).collect::<Vec<_>>()}),
            dates: vec![],
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn vault_with_private() -> (tempfile::TempDir, Index) {
        let dir = tempdir().unwrap();
        let v = dir.path();
        let w = |rel: &str, text: &str| {
            let p = v.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, text).unwrap();
        };
        w(
            "people/Alice.md",
            "---\ntype: person\nrelationship: friend\n---\nMy friend.\n",
        );
        w(
            "journal/2026/01/2026-01-01.md",
            "Coffee with [[Alice]] about lanterns.\n",
        );
        w(
            "journal/2026/01/2026-01-02.md",
            "---\nprivate: true\n---\nSecret lanterns with [[Alice]].\n",
        );
        w(
            "journal/2025/05/2025-05-05.md",
            "Old lanterns and [[Alice]].\n",
        );
        let mut idx = Index::open_in_memory().unwrap();
        idx.rebuild(v).unwrap();
        (dir, idx)
    }

    fn run(
        s: &AiSettings,
        dir: &Path,
        idx: &Index,
        tool: &str,
        args: Value,
    ) -> Result<ToolOutput, String> {
        Tools {
            vault: dir,
            index: idx,
            settings: s,
        }
        .call(tool, &args)
    }

    #[test]
    fn private_days_never_appear_anywhere() {
        let (dir, idx) = vault_with_private();
        let s = AiSettings::default();
        let all = |tool: &str, args: Value| {
            let out = run(&s, dir.path(), &idx, tool, args).map(|o| o.value.to_string());
            out.unwrap_or_default()
        };
        for text in [
            all("search", json!({"text": "lanterns"})),
            all("list_entries", json!({})),
            all("get_person", json!({"name": "Alice"})),
            all("list_people", json!({})),
        ] {
            assert!(!text.contains("2026-01-02"), "leaked: {text}");
            assert!(!text.contains("Secret"), "leaked: {text}");
        }
        assert!(run(
            &s,
            dir.path(),
            &idx,
            "read_entry",
            json!({"date": "2026-01-02"})
        )
        .is_err());
        assert!(run(
            &s,
            dir.path(),
            &idx,
            "read_entry",
            json!({"date": "2026-01-01"})
        )
        .is_ok());
        let people = all("list_people", json!({}));
        assert!(
            people.contains("\"days\":2"),
            "private day must not be counted: {people}"
        );
    }

    #[test]
    fn allow_list_limits_everything() {
        let (dir, idx) = vault_with_private();
        let s = AiSettings {
            allowed_folders: vec!["journal/2026".into(), "people".into()],
            ..AiSettings::default()
        };
        let found = run(&s, dir.path(), &idx, "search", json!({"text": "lanterns"})).unwrap();
        assert_eq!(found.dates, vec!["2026-01-01".to_string()]);
        assert!(run(
            &s,
            dir.path(),
            &idx,
            "read_entry",
            json!({"date": "2025-05-05"})
        )
        .is_err());
    }

    #[test]
    fn propose_edit_is_a_stub_and_unknown_tools_fail() {
        let (dir, idx) = vault_with_private();
        let s = AiSettings::default();
        assert!(run(&s, dir.path(), &idx, "propose_edit", json!({})).is_err());
        assert!(run(&s, dir.path(), &idx, "delete_everything", json!({})).is_err());
        assert_eq!(definitions().len(), 6);
    }
}
