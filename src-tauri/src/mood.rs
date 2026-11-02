//! Mood check-ins: the `mood:` list in a day's frontmatter, and the per-device state kept in app
//! data (check-ins waiting for their day file, and the "offered today" ledger).
//!
//! The list is edited line by line like every other frontmatter key: items that an edit doesn't
//! touch are written back exactly as they were, including keys we don't know and their comments.
//! New items are one flow mapping per line:
//!
//! ```yaml
//! mood:
//!   - { at: "07:12", valence: 0.4, emotions: [calm, hopeful], factors: [sleep] }
//! ```

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::{Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::frontmatter::{line_content, value_end};
use crate::names;
use crate::yaml::{self, quote, unquote};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CheckIn {
    /// Local time of day, `HH:MM`.
    pub at: String,
    /// -1 (very unpleasant) to 1 (very pleasant).
    pub valence: f64,
    /// Emotion note filenames (master plan §4a), so renaming an emotion can rewrite them.
    #[serde(default)]
    pub emotions: Vec<String>,
    #[serde(default)]
    pub factors: Vec<String>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum MoodError {
    #[error("\"{0}\" is not a time (use HH:MM)")]
    BadTime(String),
    #[error("mood must be between -1 and 1")]
    BadValence,
    #[error("\"{0}\" can't be used as a label")]
    BadLabel(String),
    #[error("there is no check-in #{0}")]
    NoSuchCheckIn(usize),
}

const MAX_LABELS: usize = 30;

fn valid_time(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 5
        && b[2] == b':'
        && [0, 1, 3, 4].iter().all(|&i| b[i].is_ascii_digit())
        && s[..2].parse::<u32>().is_ok_and(|h| h < 24)
        && s[3..].parse::<u32>().is_ok_and(|m| m < 60)
}

/// `7:05` → `07:05`; anything else that isn't `HH:MM` is rejected.
fn normal_time(s: &str) -> Option<String> {
    let t = s.trim();
    let padded = if t.len() == 4 && t.as_bytes().get(1) == Some(&b':') {
        format!("0{t}")
    } else {
        t.to_string()
    };
    valid_time(&padded).then_some(padded)
}

impl CheckIn {
    /// Trimmed, deduplicated and range-checked; what is actually written.
    pub fn normalized(&self) -> Result<CheckIn, MoodError> {
        let at = normal_time(&self.at).ok_or_else(|| MoodError::BadTime(self.at.clone()))?;
        if !self.valence.is_finite() || self.valence.abs() > 1.0 {
            return Err(MoodError::BadValence);
        }
        let mut valence = (self.valence * 100.0).round() / 100.0;
        if valence == 0.0 {
            valence = 0.0; // no "-0"
        }
        let clean = |list: &[String]| -> Result<Vec<String>, MoodError> {
            let mut seen = std::collections::HashSet::new();
            let mut out = Vec::new();
            for item in list.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
                if item.contains(['\n', '\r']) || item.chars().count() > 60 {
                    return Err(MoodError::BadLabel(item.to_string()));
                }
                if seen.insert(names::key(item)) && out.len() < MAX_LABELS {
                    out.push(item.to_string());
                }
            }
            Ok(out)
        };
        Ok(CheckIn {
            at,
            valence,
            emotions: clean(&self.emotions)?,
            factors: clean(&self.factors)?,
        })
    }
}

fn fmt_valence(v: f64) -> String {
    let s = format!("{v:.2}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s == "-0" || s.is_empty() {
        "0".into()
    } else {
        s.to_string()
    }
}

/// One check-in as a single-line flow mapping.
pub fn item_text(c: &CheckIn) -> String {
    let list = |items: &[String]| {
        items
            .iter()
            .map(|s| quote(s))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let mut parts = vec![
        format!("at: \"{}\"", c.at),
        format!("valence: {}", fmt_valence(c.valence)),
    ];
    if !c.emotions.is_empty() {
        parts.push(format!("emotions: [{}]", list(&c.emotions)));
    }
    if !c.factors.is_empty() {
        parts.push(format!("factors: [{}]", list(&c.factors)));
    }
    format!("{{ {} }}", parts.join(", "))
}

enum Val {
    Scalar(String),
    List(Vec<String>),
}

/// Split at top-level commas: not inside quotes, `[]` or `{}`.
fn split_top(s: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let (mut depth, mut quote_ch, mut start, mut prev) = (0i32, None::<char>, 0, '\0');
    for (i, ch) in s.char_indices() {
        match quote_ch {
            Some(q) => {
                if ch == q && !(q == '"' && prev == '\\') {
                    quote_ch = None;
                }
            }
            None => match ch {
                '"' | '\'' => quote_ch = Some(ch),
                '[' | '{' => depth += 1,
                ']' | '}' => depth -= 1,
                ',' if depth == 0 => {
                    out.push(&s[start..i]);
                    start = i + 1;
                }
                _ => {}
            },
        }
        prev = ch;
    }
    out.push(&s[start..]);
    out.into_iter().filter(|p| !p.trim().is_empty()).collect()
}

/// `key: value` → (key, raw value text), splitting at the first `:` outside quotes that is
/// followed by whitespace or the end.
fn split_kv(s: &str) -> Option<(String, &str)> {
    let mut quote_ch: Option<char> = None;
    let bytes = s.as_bytes();
    for (i, ch) in s.char_indices() {
        match quote_ch {
            Some(q) if ch == q => quote_ch = None,
            Some(_) => {}
            None if ch == '"' || ch == '\'' => quote_ch = Some(ch),
            None if ch == ':' && bytes.get(i + 1).is_none_or(|b| b.is_ascii_whitespace()) => {
                let key = unquote(s[..i].trim());
                return (!key.is_empty()).then(|| (key, s[i + 1..].trim()));
            }
            None => {}
        }
    }
    None
}

fn parse_value(v: &str) -> Val {
    let v = v.trim();
    if v.starts_with('[') && v.ends_with(']') {
        Val::List(yaml::split_flow(&v[1..v.len() - 1]))
    } else {
        Val::Scalar(unquote(v))
    }
}

fn parse_flow_map(text: &str) -> Option<Vec<(String, Val)>> {
    let t = text.trim();
    let inner = t.strip_prefix('{')?.strip_suffix('}')?;
    Some(
        split_top(inner)
            .into_iter()
            .filter_map(|part| split_kv(part.trim()).map(|(k, v)| (k, parse_value(v))))
            .collect(),
    )
}

/// The value on a line after `key:` (or after `- `), without its trailing comment.
fn token(rest: &str) -> &str {
    let c = line_content(rest);
    let start = c.len() - c.trim_start_matches([' ', '\t']).len();
    let t = c[start..value_end(rest)].trim();
    // `key: # note` has no value, only a comment.
    if t.starts_with('#') {
        ""
    } else {
        t
    }
}

/// An item written as a block (`- at: "07:12"` then indented keys), or a one-line flow mapping.
fn parse_block_item(lines: &[&str]) -> Option<Vec<(String, Val)>> {
    let first = lines.first()?.trim_start().strip_prefix('-')?;
    let head = token(first);
    if head.starts_with('{') {
        return parse_flow_map(head);
    }
    let mut pairs: Vec<(String, Val)> = Vec::new();
    let mut take = |text: &str| {
        let t = text.trim_start();
        if let Some(item) = t
            .strip_prefix("- ")
            .or((line_content(t) == "-").then_some(""))
        {
            if let Some((_, Val::List(list))) = pairs.last_mut() {
                let v = unquote(token(item));
                if !v.is_empty() {
                    list.push(v);
                }
            }
        } else if let Some((k, v)) = split_kv(line_content(t)) {
            let v = token(&format!(" {v}")).to_string();
            pairs.push((
                k,
                if v.is_empty() {
                    Val::List(Vec::new())
                } else {
                    parse_value(&v)
                },
            ));
        }
    };
    if !head.is_empty() {
        take(&format!("{head}\n"));
    }
    for l in &lines[1..] {
        take(l);
    }
    Some(pairs)
}

fn checkin_from(pairs: Vec<(String, Val)>) -> Option<CheckIn> {
    let mut at = None;
    let mut valence = None;
    let mut emotions = Vec::new();
    let mut factors = Vec::new();
    let list = |v: Val| match v {
        Val::List(l) => l,
        Val::Scalar(s) if !s.is_empty() => vec![s],
        Val::Scalar(_) => Vec::new(),
    };
    for (k, v) in pairs {
        match (k.as_str(), v) {
            ("at", Val::Scalar(s)) => at = normal_time(&s),
            ("valence", Val::Scalar(s)) => valence = s.parse::<f64>().ok(),
            ("emotions", v) => emotions = list(v),
            ("factors", v) => factors = list(v),
            _ => {}
        }
    }
    CheckIn {
        at: at?,
        valence: valence?,
        emotions,
        factors,
    }
    .normalized()
    .ok()
}

/// One entry of the list: a check-in we understood (or not), and its exact source lines when it
/// came from a block sequence.
struct Slot {
    checkin: Option<CheckIn>,
    raw: Option<String>,
}

struct Scan<'a> {
    lines: Vec<&'a str>,
    span: Option<(usize, usize)>,
    /// The value was written on the key line (`mood: [...]`), so any edit rewrites it as a block.
    inline: bool,
    /// Indented lines before the first item (comments), kept as they are.
    preamble: String,
    indent: String,
    slots: Vec<Slot>,
}

fn scan(block: &str) -> Scan<'_> {
    let (lines, span) = yaml::find_key(block, "mood");
    let mut s = Scan {
        lines,
        span,
        inline: false,
        preamble: String::new(),
        indent: "  ".into(),
        slots: Vec::new(),
    };
    let Some((i, j)) = span else { return s };
    let head = token(&s.lines[i]["mood:".len()..]).to_string();
    if !head.is_empty() {
        s.inline = true;
        if let Some(inner) = head.strip_prefix('[').and_then(|h| h.strip_suffix(']')) {
            for part in split_top(inner) {
                s.slots.push(Slot {
                    checkin: parse_flow_map(part).and_then(checkin_from),
                    raw: None,
                });
            }
        }
        return s;
    }
    let body = &s.lines[i + 1..j];
    let Some(first) = body.iter().position(|l| l.trim_start().starts_with('-')) else {
        s.preamble = body.concat();
        return s;
    };
    s.preamble = body[..first].concat();
    s.indent = body[first]
        .chars()
        .take_while(|c| *c == ' ' || *c == '\t')
        .collect();
    let mut groups: Vec<Vec<&str>> = Vec::new();
    for l in &body[first..] {
        let lead: String = l.chars().take_while(|c| *c == ' ' || *c == '\t').collect();
        if lead == s.indent && l.trim_start().starts_with('-') {
            groups.push(vec![l]);
        } else if let Some(g) = groups.last_mut() {
            g.push(l);
        }
    }
    for g in groups {
        s.slots.push(Slot {
            checkin: parse_block_item(&g).and_then(checkin_from),
            raw: Some(g.concat()),
        });
    }
    s
}

/// The check-ins in a frontmatter block, in file order. Items we can't read are skipped.
pub fn read(block: &str) -> Vec<CheckIn> {
    scan(block)
        .slots
        .into_iter()
        .filter_map(|s| s.checkin)
        .collect()
}

pub enum Op<'a> {
    /// Add one check-in at the end.
    Push(CheckIn),
    /// Add these at the end, skipping any that are already there (pending check-ins being written).
    Merge(&'a [CheckIn]),
    /// Replace the n-th readable check-in.
    Update(usize, CheckIn),
    Delete(usize),
    /// An emotion note was renamed: rewrite its name in every check-in.
    RenameEmotion {
        old_key: &'a str,
        new: &'a str,
    },
}

/// Apply `op` to a list held in memory (pending check-ins); same rules as [`edit`].
pub fn apply(list: &mut Vec<CheckIn>, op: Op) -> Result<(), MoodError> {
    match op {
        Op::Push(c) => list.push(c),
        Op::Merge(new) => {
            for c in new {
                if !list.contains(c) {
                    list.push(c.clone());
                }
            }
        }
        Op::Update(i, c) => *list.get_mut(i).ok_or(MoodError::NoSuchCheckIn(i + 1))? = c,
        Op::Delete(i) => {
            if i >= list.len() {
                return Err(MoodError::NoSuchCheckIn(i + 1));
            }
            list.remove(i);
        }
        Op::RenameEmotion { old_key, new } => {
            for c in list.iter_mut() {
                for e in c.emotions.iter_mut() {
                    if names::key(e) == old_key {
                        *e = new.to_string();
                    }
                }
            }
        }
    }
    Ok(())
}

/// Return `block` with the `mood:` list changed by `op`. Untouched items keep their exact text;
/// an empty list removes the key. A no-op returns the block unchanged.
pub fn edit(block: &str, eol: &str, op: Op) -> Result<String, MoodError> {
    let mut s = scan(block);
    let readable: Vec<usize> = (0..s.slots.len())
        .filter(|&k| s.slots[k].checkin.is_some())
        .collect();
    let mut list: Vec<CheckIn> = readable
        .iter()
        .map(|&k| s.slots[k].checkin.clone().unwrap())
        .collect();
    let before = list.clone();
    let deleted = match &op {
        Op::Delete(i) => Some(*i),
        _ => None,
    };
    apply(&mut list, op)?;

    // Fold the result back into the slots, keeping the source text of unchanged items.
    let mut changed = false;
    if let Some(i) = deleted {
        s.slots.remove(readable[i]);
        changed = true;
    } else {
        for (n, &k) in readable.iter().enumerate() {
            if list[n] != before[n] {
                s.slots[k] = Slot {
                    checkin: Some(list[n].clone()),
                    raw: None,
                };
                changed = true;
            }
        }
        for c in &list[before.len()..] {
            s.slots.push(Slot {
                checkin: Some(c.clone()),
                raw: None,
            });
            changed = true;
        }
    }
    if !changed {
        return Ok(block.to_string());
    }

    let mut value = String::new();
    for slot in &s.slots {
        match (&slot.raw, &slot.checkin) {
            (Some(raw), _) => value.push_str(raw),
            (None, Some(c)) => value.push_str(&format!("{}- {}{eol}", s.indent, item_text(c))),
            (None, None) => {} // an unreadable item from an inline list; nothing to keep it by
        }
    }
    let lines = &s.lines;
    Ok(match s.span {
        Some((i, j)) => {
            let mut out: String = lines[..i].concat();
            if !value.is_empty() || !s.preamble.is_empty() {
                out.push_str(if s.inline {
                    "mood:"
                } else {
                    line_content(lines[i])
                });
                out.push_str(eol);
                out.push_str(&s.preamble);
                out.push_str(&value);
            }
            out.push_str(&lines[j..].concat());
            out
        }
        None if block.is_empty() => format!("---{eol}mood:{eol}{value}---{eol}"),
        None => {
            let close = lines.len() - 1;
            format!(
                "{}mood:{eol}{value}{}",
                lines[..close].concat(),
                lines[close]
            )
        }
    })
}

/// Per-device mood state for one vault, in app data: check-ins waiting for their day file to be
/// created by the first text, and which days the check-in was already offered.
#[derive(Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
struct MoodState {
    /// Journal date → "shown", "answered" or "skipped".
    offered: BTreeMap<String, String>,
    pending: BTreeMap<String, Vec<CheckIn>>,
}

pub struct MoodStore {
    path: PathBuf,
    state: MoodState,
}

/// Offer records older than this are dropped; only today's matters.
const OFFERED_KEEP_DAYS: i64 = 60;

impl MoodStore {
    pub fn open(dir: &Path, vault_id: &str) -> MoodStore {
        Self::open_at(
            dir.join(format!("{vault_id}.json")),
            Local::now().date_naive(),
        )
    }

    fn open_at(path: PathBuf, today: NaiveDate) -> MoodStore {
        let mut state: MoodState = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let cutoff = (today - Duration::days(OFFERED_KEEP_DAYS))
            .format("%Y-%m-%d")
            .to_string();
        state.offered.retain(|d, _| *d >= cutoff);
        MoodStore { path, state }
    }

    fn save(&self) -> std::io::Result<()> {
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(&self.state)?)?;
        fs::rename(&tmp, &self.path)
    }

    pub fn pending(&self, date: &str) -> Vec<CheckIn> {
        self.state.pending.get(date).cloned().unwrap_or_default()
    }

    pub fn set_pending(&mut self, date: &str, list: Vec<CheckIn>) -> std::io::Result<()> {
        let before = self.state.pending.get(date).cloned().unwrap_or_default();
        if before == list {
            return Ok(());
        }
        if list.is_empty() {
            self.state.pending.remove(date);
        } else {
            self.state.pending.insert(date.to_string(), list);
        }
        self.save()
    }

    /// An emotion note was renamed: pending check-ins follow, like the ones in files.
    pub fn rename_emotion(&mut self, old_key: &str, new: &str) -> std::io::Result<()> {
        let before = serde_json::to_string(&self.state.pending).unwrap_or_default();
        for list in self.state.pending.values_mut() {
            let _ = apply(list, Op::RenameEmotion { old_key, new });
        }
        if serde_json::to_string(&self.state.pending).unwrap_or_default() == before {
            return Ok(());
        }
        self.save()
    }

    pub fn offered(&self, date: &str) -> Option<&str> {
        self.state.offered.get(date).map(String::as_str)
    }

    /// "shown" never overwrites a final answer.
    pub fn mark_offered(&mut self, date: &str, outcome: &str) -> std::io::Result<()> {
        if outcome == "shown" && self.state.offered.contains_key(date) {
            return Ok(());
        }
        self.state
            .offered
            .insert(date.to_string(), outcome.to_string());
        self.save()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn ci(at: &str, v: f64, emotions: &[&str]) -> CheckIn {
        CheckIn {
            at: at.into(),
            valence: v,
            emotions: emotions.iter().map(|s| s.to_string()).collect(),
            factors: Vec::new(),
        }
    }

    #[test]
    fn normalizes_and_validates() {
        let c = CheckIn {
            at: "7:05".into(),
            valence: -0.004,
            emotions: vec![" calm ".into(), "Calm".into(), "".into(), "hopeful".into()],
            factors: vec!["work".into()],
        }
        .normalized()
        .unwrap();
        assert_eq!(
            c,
            CheckIn {
                at: "07:05".into(),
                valence: 0.0,
                emotions: vec!["calm".into(), "hopeful".into()],
                factors: vec!["work".into()]
            }
        );
        assert_eq!(
            item_text(&c),
            "{ at: \"07:05\", valence: 0, emotions: [calm, hopeful], factors: [work] }"
        );
        for bad in ["24:00", "12:60", "noon", "", "1200"] {
            assert!(ci(bad, 0.0, &[]).normalized().is_err(), "{bad}");
        }
        assert_eq!(
            ci("10:00", 1.5, &[]).normalized(),
            Err(MoodError::BadValence)
        );
        assert_eq!(
            ci("10:00", f64::NAN, &[]).normalized(),
            Err(MoodError::BadValence)
        );
        assert!(ci("10:00", 0.0, &["a\nb"]).normalized().is_err());
        assert_eq!(fmt_valence(-0.25), "-0.25");
        assert_eq!(fmt_valence(1.0), "1");
        assert_eq!(fmt_valence(0.4), "0.4");
    }

    #[test]
    fn reads_flow_block_and_inline_forms() {
        let b = "---\nid: X\nmood: # check-ins\n  - { at: \"07:12\", valence: 0.4, emotions: [calm, hopeful], factors: [sleep] }\n  - at: 09:30\n    valence: -0.5 # meh\n    emotions:\n      - tired\n      - \"worried\"\n  - { nonsense: 1 }\nnext: 1\n---\n";
        let got = read(b);
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].emotions, vec!["calm", "hopeful"]);
        assert_eq!(got[0].factors, vec!["sleep"]);
        assert_eq!(got[1], ci("09:30", -0.5, &["tired", "worried"]));
        let inline = "---\nmood: [{ at: \"08:00\", valence: 1 }, { at: \"20:00\", valence: -1, emotions: [sad] }]\n---\n";
        assert_eq!(
            read(inline),
            vec![ci("08:00", 1.0, &[]), ci("20:00", -1.0, &["sad"])]
        );
        assert!(read("---\nid: X\n---\n").is_empty());
        assert!(read("").is_empty());
    }

    #[test]
    fn push_into_a_block_without_mood_and_into_an_empty_one() {
        let b = "---\nid: X\nmodified: M\n---\n";
        let out = edit(b, "\n", Op::Push(ci("07:12", 0.4, &["calm"]))).unwrap();
        assert_eq!(out, "---\nid: X\nmodified: M\nmood:\n  - { at: \"07:12\", valence: 0.4, emotions: [calm] }\n---\n");
        assert_eq!(read(&out), vec![ci("07:12", 0.4, &["calm"])]);
        let crlf = edit(
            "---\r\nid: X\r\n---\r\n",
            "\r\n",
            Op::Push(ci("07:12", 0.0, &[])),
        )
        .unwrap();
        assert_eq!(
            crlf,
            "---\r\nid: X\r\nmood:\r\n  - { at: \"07:12\", valence: 0 }\r\n---\r\n"
        );
    }

    #[test]
    fn edits_keep_untouched_items_and_comments_byte_for_byte() {
        let b = "---\nmood: # mine\n    # first one was early\n    - { at: \"07:12\", valence: 0.4, extra: keep } # c\n    - at: \"09:30\"\n      valence: -0.5\n    - { broken\nafter: 1\n---\n";
        let pushed = edit(b, "\n", Op::Push(ci("21:00", 0.8, &[]))).unwrap();
        assert_eq!(
            pushed,
            "---\nmood: # mine\n    # first one was early\n    - { at: \"07:12\", valence: 0.4, extra: keep } # c\n    - at: \"09:30\"\n      valence: -0.5\n    - { broken\n    - { at: \"21:00\", valence: 0.8 }\nafter: 1\n---\n"
        );
        // Updating the second readable item rewrites only it.
        let updated = edit(&pushed, "\n", Op::Update(1, ci("09:30", -0.2, &["tired"]))).unwrap();
        assert!(updated.contains("    - { at: \"07:12\", valence: 0.4, extra: keep } # c\n    - { at: \"09:30\", valence: -0.2, emotions: [tired] }\n    - { broken\n"));
        // An update to the same values changes nothing.
        assert_eq!(
            edit(&pushed, "\n", Op::Update(0, ci("07:12", 0.4, &[]))).unwrap(),
            pushed
        );
        // Delete the first readable one; the unreadable item survives.
        let deleted = edit(&updated, "\n", Op::Delete(0)).unwrap();
        assert!(!deleted.contains("07:12"));
        assert!(deleted.contains("    - { broken\n"));
        assert!(matches!(
            edit(b, "\n", Op::Delete(5)),
            Err(MoodError::NoSuchCheckIn(6))
        ));
    }

    #[test]
    fn deleting_the_last_item_removes_the_key() {
        let b = "---\nid: X\nmood:\n  - { at: \"07:12\", valence: 0.4 }\nafter: 1\n---\n";
        assert_eq!(
            edit(b, "\n", Op::Delete(0)).unwrap(),
            "---\nid: X\nafter: 1\n---\n"
        );
    }

    #[test]
    fn inline_lists_become_block_lists_when_edited() {
        let b = "---\nmood: [{ at: \"08:00\", valence: 1 }]\n---\n";
        let out = edit(b, "\n", Op::Push(ci("20:00", -1.0, &[]))).unwrap();
        assert_eq!(out, "---\nmood:\n  - { at: \"08:00\", valence: 1 }\n  - { at: \"20:00\", valence: -1 }\n---\n");
    }

    #[test]
    fn merge_skips_duplicates_and_rename_rewrites_emotions() {
        let b = "---\nmood:\n  - { at: \"07:12\", valence: 0.4, emotions: [Sad, calm] }\n  - { at: \"08:00\", valence: 0 }\n---\n";
        let pending = vec![ci("07:12", 0.4, &["Sad", "calm"]), ci("09:00", 0.1, &[])];
        let merged = edit(b, "\n", Op::Merge(&pending)).unwrap();
        assert_eq!(read(&merged).len(), 3);
        let renamed = edit(
            &merged,
            "\n",
            Op::RenameEmotion {
                old_key: "sad",
                new: "blue",
            },
        )
        .unwrap();
        assert!(renamed.contains("  - { at: \"07:12\", valence: 0.4, emotions: [blue, calm] }\n  - { at: \"08:00\", valence: 0 }\n"));
        assert_eq!(
            edit(
                &renamed,
                "\n",
                Op::RenameEmotion {
                    old_key: "sad",
                    new: "x"
                }
            )
            .unwrap(),
            renamed
        );
    }

    #[test]
    fn labels_that_need_quotes_round_trip() {
        let c = CheckIn {
            at: "10:00".into(),
            valence: 0.5,
            emotions: vec!["Paris (place)".into(), "a, b".into(), "yes".into()],
            factors: vec!["current events".into(), "self-care".into()],
        };
        let out = edit("---\n---\n", "\n", Op::Push(c.clone())).unwrap();
        assert_eq!(read(&out), vec![c]);
    }

    #[test]
    fn store_keeps_pending_and_the_ledger_across_restarts() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("mood/v.json");
        let today = NaiveDate::from_ymd_opt(2026, 10, 30).unwrap();
        let mut s = MoodStore::open_at(p.clone(), today);
        assert!(s.pending("2026-10-30").is_empty());
        s.set_pending("2026-10-30", vec![ci("07:12", 0.4, &[])])
            .unwrap();
        s.mark_offered("2026-10-30", "shown").unwrap();
        s.mark_offered("2026-10-30", "answered").unwrap();
        s.mark_offered("2026-10-30", "shown").unwrap();
        s.mark_offered("2026-01-01", "skipped").unwrap();

        let s = MoodStore::open_at(p.clone(), today);
        assert_eq!(s.pending("2026-10-30"), vec![ci("07:12", 0.4, &[])]);
        assert_eq!(s.offered("2026-10-30"), Some("answered"));
        assert_eq!(
            s.offered("2026-01-01"),
            None,
            "old ledger entries are pruned"
        );
        let mut s = s;
        s.set_pending("2026-10-30", Vec::new()).unwrap();
        assert!(MoodStore::open_at(p, today)
            .pending("2026-10-30")
            .is_empty());
    }
}
