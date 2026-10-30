//! The disposable SQLite index: notes, aliases, links (hence backlinks), tags.
//!
//! It lives in app data, keyed by vault id, never inside the vault. Everything in it is derived
//! from the files, so it can be deleted at any time and rebuilt with identical results.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::Serialize;

use crate::frontmatter;
use crate::links;
use crate::mood::{self, CheckIn};
use crate::names::{self, Kind};
use crate::vault::{date_from_file_name, hash_bytes};
use crate::yaml;

/// Bump when the tables change; an index with another version is dropped and rebuilt.
const SCHEMA_VERSION: i32 = 2;

#[derive(Debug, thiserror::Error)]
pub enum IndexError {
    #[error("index error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

type Result<T> = std::result::Result<T, IndexError>;

/// A stable id for a vault, used to name its index file in app data.
pub fn vault_id(vault: &Path) -> String {
    let canon = fs::canonicalize(vault).unwrap_or_else(|_| vault.to_path_buf());
    hash_bytes(canon.to_string_lossy().to_lowercase().as_bytes())[..16].to_string()
}

/// Vault-relative path with `/` separators.
pub fn rel_of(vault: &Path, abs: &Path) -> Option<String> {
    let rel = abs.strip_prefix(vault).ok()?;
    let parts: Vec<_> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect();
    (!parts.is_empty()).then(|| parts.join("/"))
}

/// What a vault-relative path is, if it is a note dhyana knows about: its kind and name (stem).
pub fn classify(rel: &str) -> Option<(Kind, String)> {
    let parts: Vec<&str> = rel.split('/').collect();
    let file = *parts.last()?;
    let kind = Kind::from_dir(parts[0])?;
    let stem = file.strip_suffix(".md")?;
    if file.starts_with('.') || stem.is_empty() {
        return None;
    }
    if kind == Kind::Journal {
        let ok = parts.len() == 4
            && date_from_file_name(file).is_some()
            && stem.starts_with(&format!("{}-{}-", parts[1], parts[2]));
        return ok.then(|| (kind, stem.to_string()));
    }
    (parts.len() == 2).then(|| (kind, stem.to_string()))
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EntitySummary {
    /// Vault-relative path, e.g. `people/Alice.md`. The stable handle for an entity.
    pub path: String,
    pub kind: String,
    /// The filename stem, which is what links point at.
    pub name: String,
    pub title: Option<String>,
    /// What to show: `title`, else the name.
    pub display: String,
    pub aliases: Vec<String>,
    pub mentions: usize,
    pub last_mention: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    pub path: String,
    pub kind: String,
    /// The note's name; for a journal day that is its date.
    pub name: String,
    pub date: Option<String>,
    pub context: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub tag: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpcomingEvent {
    pub date: String,
    pub label: Option<String>,
    /// The journal day (or other note) the `$date` link was written in.
    pub source: String,
    pub source_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DayStat {
    pub date: String,
    pub words: usize,
    pub checkins: usize,
    /// Average valence of the day's check-ins.
    pub valence: Option<f64>,
}

/// Everything read from one note file that the index stores.
struct Parsed {
    title: Option<String>,
    relationship: Option<String>,
    birthday: Option<String>,
    aliases: Vec<String>,
    links: Vec<links::WikiLink>,
    tags: Vec<String>,
    words: usize,
    moods: Vec<CheckIn>,
}

/// Words in a note body: whitespace-separated runs with at least one letter or digit, so `-` and
/// list markers don't count and `[[Alice]]` counts once. Mirrored in `src/lib/words.ts`.
pub fn count_words(body: &str) -> usize {
    body.split_whitespace()
        .filter(|w| w.chars().any(char::is_alphanumeric))
        .count()
}

fn parse_note(text: &str) -> Parsed {
    let s = frontmatter::split(text);
    let scan = links::scan(s.body);
    Parsed {
        words: count_words(s.body),
        moods: mood::read(s.block),
        title: frontmatter::get_value(s.block, "title").map(|v| yaml::unquote(&v)),
        relationship: frontmatter::get_value(s.block, "relationship"),
        birthday: frontmatter::get_value(s.block, "birthday"),
        aliases: yaml::get_list(s.block, "aliases"),
        links: scan.links,
        tags: scan.tags.into_iter().map(|t| t.tag).collect(),
    }
}

fn mtime_ns(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_nanos() as i64)
}

/// All note files the index covers, as `(relative path, mtime, size)`.
fn walk_vault(vault: &Path) -> Vec<(String, i64, i64)> {
    fn walk(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for e in entries.flatten() {
            let Ok(t) = e.file_type() else { continue };
            if t.is_dir() && depth > 0 {
                walk(&e.path(), depth - 1, out);
            } else if t.is_file() {
                out.push(e.path());
            }
        }
    }
    let mut found = Vec::new();
    for kind in Kind::ALL {
        let depth = if kind == Kind::Journal { 2 } else { 0 };
        walk(&vault.join(kind.dir()), depth, &mut found);
    }
    let mut files: Vec<(String, i64, i64)> = found
        .into_iter()
        .filter_map(|p| {
            let rel = rel_of(vault, &p)?;
            classify(&rel)?;
            let meta = fs::metadata(&p).ok()?;
            Some((rel, mtime_ns(&meta), meta.len() as i64))
        })
        .collect();
    files.sort();
    files
}

/// The open vault and its index, shared between commands and the file watcher.
pub struct VaultIndex {
    pub vault: PathBuf,
    pub index: Index,
}

pub type SharedIndex = std::sync::Arc<std::sync::Mutex<Option<VaultIndex>>>;

impl VaultIndex {
    /// Open (or create) the vault's index in `index_dir`, and bring it up to date. A damaged
    /// index file is simply deleted and rebuilt: it holds nothing the files don't.
    pub fn open(vault: &Path, index_dir: &Path) -> Result<VaultIndex> {
        let db = index_dir.join(format!("{}.db", vault_id(vault)));
        let mut index = match Index::open(&db).and_then(|mut i| i.sync(vault).map(|_| i)) {
            Ok(i) => i,
            Err(_) => {
                let _ = fs::remove_file(&db);
                let mut i = Index::open(&db)?;
                i.rebuild(vault)?;
                i
            }
        };
        index.sync(vault)?;
        Ok(VaultIndex {
            vault: vault.to_path_buf(),
            index,
        })
    }

    /// Re-read the indexed notes among `paths` (absolute). Returns the vault-relative paths
    /// that were refreshed.
    pub fn refresh_paths<'a>(
        &mut self,
        paths: impl IntoIterator<Item = &'a PathBuf>,
    ) -> Result<Vec<String>> {
        let mut rels: Vec<String> = paths
            .into_iter()
            .filter_map(|p| rel_of(&self.vault, p))
            .filter(|r| classify(r).is_some())
            .collect();
        rels.sort();
        rels.dedup();
        if !rels.is_empty() {
            self.index.refresh(&self.vault, &rels)?;
        }
        Ok(rels)
    }
}

pub struct Index {
    conn: Connection,
}

impl Index {
    pub fn open(path: &Path) -> Result<Index> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        Self::init(Connection::open(path)?)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Index> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Index> {
        let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version != SCHEMA_VERSION {
            conn.execute_batch(
                "DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS aliases;
                 DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS tags; DROP TABLE IF EXISTS moods;",
            )?;
            conn.execute_batch(include_str!("index_schema.sql"))?;
            conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        }
        Ok(Index { conn })
    }

    /// Throw everything away and re-read the vault.
    pub fn rebuild(&mut self, vault: &Path) -> Result<()> {
        self.conn
            .execute_batch("DELETE FROM notes; DELETE FROM aliases; DELETE FROM links; DELETE FROM tags; DELETE FROM moods;")?;
        self.sync(vault)
    }

    /// Bring the index in line with the files: re-read what changed, drop what vanished.
    pub fn sync(&mut self, vault: &Path) -> Result<()> {
        let files = walk_vault(vault);
        let known: HashMap<String, (i64, i64)> = {
            let mut stmt = self.conn.prepare("SELECT path, mtime, size FROM notes")?;
            let rows = stmt.query_map([], |r| Ok((r.get(0)?, (r.get(1)?, r.get(2)?))))?;
            rows.collect::<std::result::Result<_, _>>()?
        };
        let tx = self.conn.transaction()?;
        for (rel, mtime, size) in &files {
            if known.get(rel) != Some(&(*mtime, *size)) {
                index_file(&tx, vault, rel)?;
            }
        }
        let live: std::collections::HashSet<&String> = files.iter().map(|f| &f.0).collect();
        for path in known.keys().filter(|p| !live.contains(p)) {
            remove_rows(&tx, path)?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Re-read exactly these files (vault-relative); missing ones are dropped from the index.
    pub fn refresh(&mut self, vault: &Path, rels: &[String]) -> Result<()> {
        let tx = self.conn.transaction()?;
        for rel in rels {
            index_file(&tx, vault, rel)?;
        }
        tx.commit()?;
        Ok(())
    }

    fn aliases_of(&self, path: &str) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT alias FROM aliases WHERE path = ?1 ORDER BY rowid")?;
        let rows = stmt.query_map([path], |r| r.get(0))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Mentions per link-target key: `(count, newest journal date)`.
    fn mention_stats(&self) -> Result<HashMap<String, (usize, Option<String>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT l.target_key, COUNT(*), MAX(CASE WHEN n.kind = 'journal' THEN n.name END)
             FROM links l JOIN notes n ON n.path = l.src WHERE n.name_key <> l.target_key GROUP BY l.target_key",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                (r.get::<_, i64>(1)? as usize, r.get(2)?),
            ))
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    fn summary_from_row(
        &self,
        stats: &HashMap<String, (usize, Option<String>)>,
        path: String,
        kind: String,
        name: String,
        title: Option<String>,
    ) -> Result<EntitySummary> {
        let aliases = self.aliases_of(&path)?;
        let mut mentions = 0;
        let mut last: Option<String> = None;
        let mut keys = vec![names::key(&name)];
        keys.extend(aliases.iter().map(|a| names::key(a)));
        keys.dedup();
        for k in &keys {
            if let Some((n, d)) = stats.get(k) {
                mentions += n;
                if d.is_some() && (last.is_none() || d > &last) {
                    last = d.clone();
                }
            }
        }
        Ok(EntitySummary {
            display: title.clone().unwrap_or_else(|| name.clone()),
            path,
            kind,
            name,
            title,
            aliases,
            mentions,
            last_mention: last,
        })
    }

    /// People, places, emotions and plain notes, for autocomplete and entity lists.
    pub fn entities(&self) -> Result<Vec<EntitySummary>> {
        let stats = self.mention_stats()?;
        let mut stmt = self.conn.prepare(
            "SELECT path, kind, name, title FROM notes
             WHERE kind IN ('person','place','emotion','note') ORDER BY kind, name_key, path",
        )?;
        let rows: Vec<(String, String, String, Option<String>)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
            .collect::<std::result::Result<_, _>>()?;
        rows.into_iter()
            .map(|(p, k, n, t)| self.summary_from_row(&stats, p, k, n, t))
            .collect()
    }

    pub fn summary(&self, path: &str) -> Result<Option<EntitySummary>> {
        let stats = self.mention_stats()?;
        let row = self
            .conn
            .query_row(
                "SELECT path, kind, name, title FROM notes WHERE path = ?1",
                [path],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()?;
        row.map(|(p, k, n, t): (String, String, String, Option<String>)| {
            self.summary_from_row(&stats, p, k, n, t)
        })
        .transpose()
    }

    /// `(relationship, birthday)` of a note.
    pub fn props(&self, path: &str) -> Result<(Option<String>, Option<String>)> {
        Ok(self
            .conn
            .query_row(
                "SELECT relationship, birthday FROM notes WHERE path = ?1",
                [path],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?
            .unwrap_or((None, None)))
    }

    /// Notes (any kind) whose filename matches `key` — at most one if names are unique.
    pub fn by_name_key(&self, key: &str) -> Result<Vec<(String, Kind)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT path, kind FROM notes WHERE name_key = ?1 ORDER BY path")?;
        let rows = stmt.query_map([key], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        let mut out = Vec::new();
        for r in rows {
            let (p, k) = r?;
            if let Some(kind) = Kind::parse(&k) {
                out.push((p, kind));
            }
        }
        Ok(out)
    }

    /// A note of `kind` that already goes by `key`, by filename, title or alias.
    pub fn same_kind_with_key(&self, kind: Kind, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row(
                "SELECT n.path FROM notes n WHERE n.kind = ?1 AND (n.name_key = ?2 OR n.title_key = ?2)
                 UNION
                 SELECT n.path FROM notes n JOIN aliases a ON a.path = n.path
                 WHERE n.kind = ?1 AND a.alias_key = ?2 LIMIT 1",
                params![kind.as_str(), key],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// The note (other than `except`) that already uses this alias key: `(path, display name)`.
    pub fn alias_owner(&self, alias_key: &str, except: &str) -> Result<Option<(String, String)>> {
        Ok(self
            .conn
            .query_row(
                "SELECT n.path, COALESCE(n.title, n.name) FROM aliases a JOIN notes n ON n.path = a.path
                 WHERE a.alias_key = ?1 AND a.path <> ?2 LIMIT 1",
                params![alias_key, except],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?)
    }

    /// The link keys that resolve to a note: its filename, then aliases no other filename claims.
    fn link_keys(&self, path: &str) -> Result<Vec<String>> {
        let Some((name,)) = self
            .conn
            .query_row("SELECT name_key FROM notes WHERE path = ?1", [path], |r| {
                Ok((r.get::<_, String>(0)?,))
            })
            .optional()?
        else {
            return Ok(Vec::new());
        };
        let mut keys = vec![name];
        let mut stmt = self.conn.prepare(
            "SELECT a.alias_key FROM aliases a WHERE a.path = ?1
             AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.name_key = a.alias_key)",
        )?;
        for k in stmt.query_map([path], |r| r.get::<_, String>(0))? {
            keys.push(k?);
        }
        keys.dedup();
        Ok(keys)
    }

    /// Everything that links to this note (by filename or alias), newest journal days first.
    pub fn mentions(&self, path: &str, limit: usize) -> Result<Vec<Mention>> {
        let keys = self.link_keys(path)?;
        if keys.is_empty() {
            return Ok(Vec::new());
        }
        let marks = vec!["?"; keys.len()].join(",");
        let sql = format!(
            "SELECT n.path, n.kind, n.name, l.context FROM links l JOIN notes n ON n.path = l.src
             WHERE l.target_key IN ({marks}) AND l.src <> ?
             ORDER BY (n.kind = 'journal') DESC, n.name DESC, n.path, l.ord LIMIT ?"
        );
        let mut args: Vec<rusqlite::types::Value> = keys.into_iter().map(Into::into).collect();
        args.push(path.to_string().into());
        args.push((limit as i64).into());
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(args), |r| {
            let kind: String = r.get(1)?;
            let name: String = r.get(2)?;
            Ok(Mention {
                path: r.get(0)?,
                date: (kind == "journal").then(|| name.clone()),
                kind,
                name,
                context: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Notes that use `#tag`, newest journal days first (one row per note, no context yet).
    pub fn tag_mentions(&self, tag: &str, limit: usize) -> Result<Vec<Mention>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT n.path, n.kind, n.name FROM tags t JOIN notes n ON n.path = t.src
             WHERE t.tag_key = ?1 ORDER BY (n.kind = 'journal') DESC, n.name DESC, n.path LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![names::key(tag), limit as i64], |r| {
            let kind: String = r.get(1)?;
            let name: String = r.get(2)?;
            Ok(Mention {
                path: r.get(0)?,
                date: (kind == "journal").then(|| name.clone()),
                kind,
                name,
                context: String::new(),
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Paths of the notes that contain a link to `key` (a filename key).
    pub fn linking_to(&self, key: &str) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT DISTINCT src FROM links WHERE target_key = ?1 ORDER BY src")?;
        let rows = stmt.query_map([key], |r| r.get(0))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Tags in use plus tags registered as `tags/*.md`, most used first.
    pub fn tags(&self) -> Result<Vec<TagInfo>> {
        let mut by_key: HashMap<String, TagInfo> = HashMap::new();
        {
            let mut stmt = self
                .conn
                .prepare("SELECT MIN(tag), COUNT(*) FROM tags GROUP BY tag_key")?;
            for r in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
                let (tag, n) = r?;
                by_key.insert(
                    names::key(&tag),
                    TagInfo {
                        tag,
                        count: n as usize,
                    },
                );
            }
        }
        let mut stmt = self
            .conn
            .prepare("SELECT COALESCE(title, name) FROM notes WHERE kind = 'tag'")?;
        for r in stmt.query_map([], |r| r.get::<_, String>(0))? {
            let tag = r?;
            by_key
                .entry(names::key(&tag))
                .or_insert(TagInfo { tag, count: 0 });
        }
        let mut out: Vec<TagInfo> = by_key.into_values().collect();
        out.sort_by(|a, b| {
            b.count
                .cmp(&a.count)
                .then_with(|| names::key(&a.tag).cmp(&names::key(&b.tag)))
        });
        Ok(out)
    }

    /// `$date` links to `from` or later (`YYYY-MM-DD`), soonest first.
    pub fn upcoming(&self, from: &str, limit: usize) -> Result<Vec<UpcomingEvent>> {
        let mut stmt = self.conn.prepare(
            "SELECT l.target_key, l.label, n.name, n.kind FROM links l JOIN notes n ON n.path = l.src
             WHERE l.target_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND l.target_key >= ?1
               AND l.target_key <> n.name
             ORDER BY l.target_key, n.name, l.ord LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![from, limit as i64], |r| {
            let kind: String = r.get(3)?;
            let name: String = r.get(2)?;
            Ok(UpcomingEvent {
                date: r.get(0)?,
                label: r.get(1)?,
                source_date: (kind == "journal").then(|| name.clone()),
                source: name,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Per-day numbers for journal days from `from` to `to` (inclusive, `YYYY-MM-DD`), oldest first.
    /// Days without a file are absent.
    pub fn day_stats(&self, from: &str, to: &str) -> Result<Vec<DayStat>> {
        let mut stmt = self.conn.prepare(
            "SELECT n.name, n.words, COUNT(m.ord), AVG(m.valence) FROM notes n LEFT JOIN moods m ON m.src = n.path
             WHERE n.kind = 'journal' AND n.name >= ?1 AND n.name <= ?2 GROUP BY n.path ORDER BY n.name",
        )?;
        let rows = stmt.query_map(params![from, to], |r| {
            Ok(DayStat {
                date: r.get(0)?,
                words: r.get::<_, i64>(1)? as usize,
                checkins: r.get::<_, i64>(2)? as usize,
                valence: r
                    .get::<_, Option<f64>>(3)?
                    .map(|v| (v * 100.0).round() / 100.0),
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Journal days in earlier years on the same month and day as `date`, newest first:
    /// `(path, date, words)`.
    pub fn same_day_earlier(
        &self,
        date: &str,
        limit: usize,
    ) -> Result<Vec<(String, String, usize)>> {
        let mut stmt = self.conn.prepare(
            "SELECT path, name, words FROM notes
             WHERE kind = 'journal' AND substr(name, 5) = substr(?1, 5) AND name < ?1 ORDER BY name DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![date, limit as i64], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? as usize))
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Journal days with a check-in that names this emotion (by name key).
    pub fn with_emotion(&self, key: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT src FROM moods WHERE instr(emotion_keys, char(10) || ?1 || char(10)) > 0 ORDER BY src",
        )?;
        let rows = stmt.query_map([key], |r| r.get(0))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Every table, ordered and rendered as text. Two indexes of the same vault dump equal.
    #[cfg(test)]
    pub fn dump(&self) -> Result<String> {
        let mut out = String::new();
        for (label, sql) in [
            ("notes", "SELECT path||'|'||kind||'|'||name||'|'||IFNULL(title,'')||'|'||IFNULL(relationship,'')||'|'||IFNULL(birthday,'')||'|'||words FROM notes ORDER BY path"),
            ("moods", "SELECT src||'|'||ord||'|'||at||'|'||valence||'|'||emotions||'|'||factors FROM moods ORDER BY src, ord"),
            ("aliases", "SELECT path||'|'||alias FROM aliases ORDER BY path, rowid"),
            ("links", "SELECT src||'|'||ord||'|'||target||'|'||IFNULL(label,'')||'|'||context FROM links ORDER BY src, ord"),
            ("tags", "SELECT src||'|'||tag FROM tags ORDER BY src, rowid"),
        ] {
            out.push_str(&format!("[{label}]\n"));
            let mut stmt = self.conn.prepare(sql)?;
            for r in stmt.query_map([], |r| r.get::<_, String>(0))? {
                out.push_str(&r?);
                out.push('\n');
            }
        }
        Ok(out)
    }
}

fn remove_rows(conn: &Connection, path: &str) -> Result<()> {
    conn.execute("DELETE FROM notes WHERE path = ?1", [path])?;
    conn.execute("DELETE FROM aliases WHERE path = ?1", [path])?;
    conn.execute("DELETE FROM links WHERE src = ?1", [path])?;
    conn.execute("DELETE FROM tags WHERE src = ?1", [path])?;
    conn.execute("DELETE FROM moods WHERE src = ?1", [path])?;
    Ok(())
}

/// (Re)index one file, or drop it if it is gone, unreadable as UTF-8, or not a note we track.
fn index_file(conn: &Connection, vault: &Path, rel: &str) -> Result<()> {
    remove_rows(conn, rel)?;
    let Some((kind, name)) = classify(rel) else {
        return Ok(());
    };
    let abs = vault.join(rel);
    let (Ok(meta), Ok(bytes)) = (fs::metadata(&abs), fs::read(&abs)) else {
        return Ok(());
    };
    let Ok(text) = String::from_utf8(bytes) else {
        return Ok(());
    };
    let p = parse_note(&text);
    conn.execute(
        "INSERT INTO notes(path, kind, name, name_key, title, title_key, relationship, birthday, words, mtime, size)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![
            rel,
            kind.as_str(),
            name,
            names::key(&name),
            p.title,
            p.title.as_deref().map(names::key),
            p.relationship,
            p.birthday,
            p.words as i64,
            mtime_ns(&meta),
            meta.len() as i64
        ],
    )?;
    for alias in &p.aliases {
        conn.execute(
            "INSERT INTO aliases(path, alias, alias_key) VALUES (?1,?2,?3)",
            params![rel, alias, names::key(alias)],
        )?;
    }
    for (i, l) in p.links.iter().enumerate() {
        conn.execute(
            "INSERT INTO links(src, ord, target, target_key, label, context) VALUES (?1,?2,?3,?4,?5,?6)",
            params![rel, i as i64, l.target, names::key(&l.target), l.label, l.context],
        )?;
    }
    for tag in &p.tags {
        conn.execute(
            "INSERT INTO tags(src, tag, tag_key) VALUES (?1,?2,?3)",
            params![rel, tag, names::key(tag)],
        )?;
    }
    if kind == Kind::Journal {
        for (i, m) in p.moods.iter().enumerate() {
            let keys: String = m
                .emotions
                .iter()
                .map(|e| format!("\n{}", names::key(e)))
                .collect();
            conn.execute(
                "INSERT INTO moods(src, ord, at, valence, emotions, emotion_keys, factors) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![rel, i as i64, m.at, m.valence, m.emotions.join("\n"), format!("{keys}\n"), m.factors.join("\n")],
            )?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn put(vault: &Path, rel: &str, text: &str) {
        let p = vault.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    fn sample(v: &Path) {
        put(
            v,
            "people/Alice.md",
            "---\ntype: person\naliases: [Ali, Al]\nrelationship: friend\n---\nNotes.\n",
        );
        put(v, "people/Bob.md", "---\ntype: person\n---\n");
        put(
            v,
            "places/Paris (place).md",
            "---\ntype: place\ntitle: Paris\naliases: [Paris]\n---\n",
        );
        put(v, "emotions/sad.md", "---\ntype: emotion\n---\n");
        put(
            v,
            "journal/2026/10/2026-10-27.md",
            "---\nid: X\n---\nMet [[Alice]] at [[Paris (place)|Paris]] #travel\n",
        );
        put(v, "journal/2026/10/2026-10-28.md", "Felt [[sad]]. Ali called, [[Ali]] and [[Bob]]. See [[2026-12-25|Mom's birthday]] #travel #work\n");
        put(
            v,
            "journal/2026/10/notes.md",
            "[[Alice]] ignored: not a day file",
        );
        put(v, "other/ignored.md", "[[Alice]]");
    }

    #[test]
    fn classify_paths() {
        assert_eq!(
            classify("people/Alice.md"),
            Some((Kind::Person, "Alice".into()))
        );
        assert_eq!(
            classify("journal/2026/10/2026-10-28.md"),
            Some((Kind::Journal, "2026-10-28".into()))
        );
        for bad in [
            "journal/2026/10/notes.md",
            "journal/2026/09/2026-10-28.md",
            "people/.hidden.md",
            "people/sub/Alice.md",
            "people/Alice.txt",
            "other/x.md",
            "README.md",
            "journal/2026-10-28.md",
        ] {
            assert_eq!(classify(bad), None, "{bad}");
        }
    }

    #[test]
    fn indexes_notes_links_and_backlinks() {
        let dir = tempdir().unwrap();
        sample(dir.path());
        let mut idx = Index::open_in_memory().unwrap();
        idx.sync(dir.path()).unwrap();

        let all = idx.entities().unwrap();
        let names: Vec<_> = all.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["sad", "Alice", "Bob", "Paris (place)"]);
        let alice = idx.summary("people/Alice.md").unwrap().unwrap();
        // [[Alice]] on the 27th plus [[Ali]] (alias) on the 28th.
        assert_eq!(alice.mentions, 2);
        assert_eq!(alice.last_mention.as_deref(), Some("2026-10-28"));
        assert_eq!(alice.aliases, vec!["Ali", "Al"]);

        let m = idx.mentions("people/Alice.md", 50).unwrap();
        assert_eq!(
            m.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(),
            vec!["2026-10-28", "2026-10-27"]
        );
        assert!(m[1].context.contains("Met [[Alice]]"));

        let paris = idx.summary("places/Paris (place).md").unwrap().unwrap();
        assert_eq!(paris.display, "Paris");
        assert_eq!(paris.mentions, 1);

        let tags = idx.tags().unwrap();
        assert_eq!(
            tags[0],
            TagInfo {
                tag: "travel".into(),
                count: 2
            }
        );
        assert_eq!(
            tags[1],
            TagInfo {
                tag: "work".into(),
                count: 1
            }
        );
    }

    #[test]
    fn upcoming_lists_future_date_links() {
        let dir = tempdir().unwrap();
        sample(dir.path());
        let mut idx = Index::open_in_memory().unwrap();
        idx.sync(dir.path()).unwrap();
        let ev = idx.upcoming("2026-10-29", 10).unwrap();
        assert_eq!(ev.len(), 1);
        assert_eq!(ev[0].date, "2026-12-25");
        assert_eq!(ev[0].label.as_deref(), Some("Mom's birthday"));
        assert_eq!(ev[0].source_date.as_deref(), Some("2026-10-28"));
        assert!(idx.upcoming("2027-01-01", 10).unwrap().is_empty());
    }

    #[test]
    fn rebuild_from_scratch_gives_identical_results() {
        let dir = tempdir().unwrap();
        sample(dir.path());
        let db = dir.path().join("app/index.db");
        let before = {
            let mut idx = Index::open(&db).unwrap();
            idx.sync(dir.path()).unwrap();
            idx.dump().unwrap()
        };
        assert!(before.contains("[links]"));
        fs::remove_file(&db).unwrap();
        let mut fresh = Index::open(&db).unwrap();
        fresh.sync(dir.path()).unwrap();
        assert_eq!(fresh.dump().unwrap(), before);
        fresh.rebuild(dir.path()).unwrap();
        assert_eq!(fresh.dump().unwrap(), before);
    }

    #[test]
    fn incremental_updates_match_a_rebuild() {
        let dir = tempdir().unwrap();
        sample(dir.path());
        let mut idx = Index::open_in_memory().unwrap();
        idx.sync(dir.path()).unwrap();

        put(
            dir.path(),
            "journal/2026/10/2026-10-29.md",
            "New day with [[Bob]] #work\n",
        );
        fs::remove_file(dir.path().join("people/Bob.md")).unwrap();
        put(
            dir.path(),
            "people/Alice.md",
            "---\ntype: person\naliases: [Ali]\n---\nShorter.\n",
        );
        idx.refresh(
            dir.path(),
            &[
                "journal/2026/10/2026-10-29.md".into(),
                "people/Bob.md".into(),
                "people/Alice.md".into(),
            ],
        )
        .unwrap();

        let mut fresh = Index::open_in_memory().unwrap();
        fresh.sync(dir.path()).unwrap();
        assert_eq!(idx.dump().unwrap(), fresh.dump().unwrap());

        // A plain sync notices offline changes too.
        fs::remove_file(dir.path().join("journal/2026/10/2026-10-27.md")).unwrap();
        idx.sync(dir.path()).unwrap();
        let mut fresh2 = Index::open_in_memory().unwrap();
        fresh2.sync(dir.path()).unwrap();
        assert_eq!(idx.dump().unwrap(), fresh2.dump().unwrap());
    }

    #[test]
    fn alias_owner_and_same_kind_lookups() {
        let dir = tempdir().unwrap();
        sample(dir.path());
        let mut idx = Index::open_in_memory().unwrap();
        idx.sync(dir.path()).unwrap();
        let owner = idx
            .alias_owner(&names::key("ali"), "people/Bob.md")
            .unwrap()
            .unwrap();
        assert_eq!(owner, ("people/Alice.md".to_string(), "Alice".to_string()));
        assert!(idx
            .alias_owner(&names::key("ali"), "people/Alice.md")
            .unwrap()
            .is_none());
        assert!(idx
            .same_kind_with_key(Kind::Place, &names::key("paris"))
            .unwrap()
            .is_some());
        assert!(idx
            .same_kind_with_key(Kind::Person, &names::key("paris"))
            .unwrap()
            .is_none());
        assert_eq!(
            idx.by_name_key(&names::key("ALICE")).unwrap()[0].1,
            Kind::Person
        );
    }

    #[test]
    fn non_utf8_files_are_skipped_not_fatal() {
        let dir = tempdir().unwrap();
        sample(dir.path());
        fs::write(dir.path().join("people/Bad.md"), [0xff, 0xfe, 0x00]).unwrap();
        let mut idx = Index::open_in_memory().unwrap();
        idx.sync(dir.path()).unwrap();
        assert!(idx.summary("people/Bad.md").unwrap().is_none());
    }

    #[test]
    fn day_stats_words_moods_and_same_day() {
        let dir = tempdir().unwrap();
        sample(dir.path());
        put(dir.path(), "journal/2025/10/2025-10-28.md", "---\nmood:\n  - { at: \"08:00\", valence: 0.5, emotions: [Sad, calm] }\n  - { at: \"20:00\", valence: -0.2 }\n---\nA year ago - [[Alice]] *was* here\n");
        put(dir.path(), "journal/2024/10/2024-10-28.md", "two words\n");
        let mut idx = Index::open_in_memory().unwrap();
        idx.sync(dir.path()).unwrap();

        let stats = idx.day_stats("2025-01-01", "2026-10-27").unwrap();
        assert_eq!(
            stats,
            vec![
                DayStat {
                    date: "2025-10-28".into(),
                    words: 6,
                    checkins: 2,
                    valence: Some(0.15)
                },
                DayStat {
                    date: "2026-10-27".into(),
                    words: 6,
                    checkins: 0,
                    valence: None
                },
            ]
        );
        let earlier = idx.same_day_earlier("2026-10-28", 10).unwrap();
        assert_eq!(
            earlier.iter().map(|e| e.1.as_str()).collect::<Vec<_>>(),
            vec!["2025-10-28", "2024-10-28"]
        );
        assert_eq!(earlier[1].2, 2);
        assert_eq!(
            idx.with_emotion("sad").unwrap(),
            vec!["journal/2025/10/2025-10-28.md"]
        );
        assert!(idx.with_emotion("sa").unwrap().is_empty());
        assert_eq!(count_words("- [ ] buy milk\n\n# Title — ok"), 4);
    }

    #[test]
    fn vault_ids_are_stable_and_distinct() {
        let a = tempdir().unwrap();
        let b = tempdir().unwrap();
        assert_eq!(vault_id(a.path()), vault_id(a.path()));
        assert_ne!(vault_id(a.path()), vault_id(b.path()));
        assert_eq!(vault_id(a.path()).len(), 16);
    }
}
