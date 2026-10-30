//! Day-file storage: read, save (lazy create, conflict detection, atomic write)
//! and listing. All paths are derived from a strictly validated date, never
//! from caller-supplied path text.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::{Datelike, Local, NaiveDate, SecondsFormat};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::frontmatter::{self, Fields};

#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    #[error("invalid date: {0}")]
    InvalidDate(String),
    #[error("file is not valid UTF-8: {0}")]
    NotUtf8(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DayFile {
    pub exists: bool,
    pub body: String,
    pub hash: String,
    pub created: Option<String>,
    pub modified: Option<String>,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SaveStatus {
    Saved,
    Skipped,
    Conflict,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub status: SaveStatus,
    pub hash: String,
    pub created: Option<String>,
    pub modified: Option<String>,
}

/// Strictly `YYYY-MM-DD` and a real calendar date.
pub fn validate_date(s: &str) -> Result<NaiveDate, VaultError> {
    let b = s.as_bytes();
    let shape_ok = b.len() == 10
        && b.iter()
            .enumerate()
            .all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() });
    if !shape_ok {
        return Err(VaultError::InvalidDate(s.to_string()));
    }
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| VaultError::InvalidDate(s.to_string()))
}

pub fn day_path(vault: &Path, date: NaiveDate) -> PathBuf {
    vault
        .join("journal")
        .join(format!("{:04}", date.year()))
        .join(format!("{:02}", date.month()))
        .join(format!("{}.md", date.format("%Y-%m-%d")))
}

pub fn hash_bytes(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn read_raw(path: &Path) -> Result<Option<(String, String)>, VaultError> {
    match fs::read(path) {
        Ok(bytes) => {
            let hash = hash_bytes(&bytes);
            let text = String::from_utf8(bytes)
                .map_err(|_| VaultError::NotUtf8(path.display().to_string()))?;
            Ok(Some((text, hash)))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn read_day(vault: &Path, date: &str) -> Result<DayFile, VaultError> {
    let d = validate_date(date)?;
    match read_raw(&day_path(vault, d))? {
        None => Ok(DayFile {
            exists: false,
            body: String::new(),
            hash: String::new(),
            created: None,
            modified: None,
        }),
        Some((text, hash)) => {
            let s = frontmatter::split(&text);
            Ok(DayFile {
                exists: true,
                body: s.body.to_string(),
                hash,
                created: frontmatter::get_value(s.block, "created"),
                modified: frontmatter::get_value(s.block, "modified"),
            })
        }
    }
}

/// A staged atomic write: bytes are in a temp file next to the target until
/// `commit` renames them over it. Dropping without committing removes the temp
/// file and leaves the target untouched.
pub struct StagedWrite {
    tmp: PathBuf,
    target: PathBuf,
    committed: bool,
}

impl StagedWrite {
    pub fn stage(target: &Path, bytes: &[u8]) -> Result<Self, VaultError> {
        let name = target
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let tmp = target.with_file_name(format!(".{name}.tmp"));
        let staged = StagedWrite {
            tmp,
            target: target.to_path_buf(),
            committed: false,
        };
        // If any step fails, Drop cleans the temp file up.
        let mut f = fs::File::create(&staged.tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        Ok(staged)
    }

    pub fn commit(mut self) -> Result<(), VaultError> {
        fs::rename(&self.tmp, &self.target)?;
        self.committed = true;
        Ok(())
    }
}

impl Drop for StagedWrite {
    fn drop(&mut self) {
        if !self.committed {
            let _ = fs::remove_file(&self.tmp);
        }
    }
}

fn now_string() -> String {
    Local::now().to_rfc3339_opts(SecondsFormat::Secs, false)
}

fn birth_string(path: &Path) -> Option<String> {
    let created = fs::metadata(path).ok()?.created().ok()?;
    let dt: chrono::DateTime<Local> = created.into();
    Some(dt.to_rfc3339_opts(SecondsFormat::Secs, false))
}

/// Save with the real clock.
pub fn save_day(
    vault: &Path,
    date: &str,
    body: &str,
    expected_hash: Option<&str>,
    force: bool,
) -> Result<SaveResult, VaultError> {
    save_day_at(vault, date, body, expected_hash, force, &now_string())
}

/// Save with an explicit "now" (RFC 3339), for deterministic tests.
pub fn save_day_at(
    vault: &Path,
    date: &str,
    body: &str,
    expected_hash: Option<&str>,
    force: bool,
    now: &str,
) -> Result<SaveResult, VaultError> {
    let d = validate_date(date)?;
    let path = day_path(vault, d);
    let existing = read_raw(&path)?;
    let current_hash = existing.as_ref().map(|(_, h)| h.clone()).unwrap_or_default();

    let info = |text: &Option<(String, String)>| match text {
        Some((t, _)) => {
            let s = frontmatter::split(t);
            (
                frontmatter::get_value(s.block, "created"),
                frontmatter::get_value(s.block, "modified"),
            )
        }
        None => (None, None),
    };

    if let Some(expected) = expected_hash {
        if !force && expected != current_hash {
            let (created, modified) = info(&existing);
            return Ok(SaveResult {
                status: SaveStatus::Conflict,
                hash: current_hash,
                created,
                modified,
            });
        }
    }

    let skipped = |existing: &Option<(String, String)>, hash: String| {
        let (created, modified) = info(existing);
        SaveResult {
            status: SaveStatus::Skipped,
            hash,
            created,
            modified,
        }
    };

    let (bom, block, eol, has_existing) = match &existing {
        None => {
            if body.trim().is_empty() {
                return Ok(skipped(&existing, current_hash));
            }
            (false, String::new(), "\n", false)
        }
        Some((text, _)) => {
            let s = frontmatter::split(text);
            if s.body == body {
                return Ok(skipped(&existing, current_hash));
            }
            (
                s.bom,
                s.block.to_string(),
                frontmatter::detect_eol(text),
                true,
            )
        }
    };

    let existing_created = frontmatter::get_value(&block, "created");
    let created = match existing_created {
        Some(c) => c,
        None if has_existing => birth_string(&path).unwrap_or_else(|| now.to_string()),
        None => now.to_string(),
    };
    let id = ulid::Ulid::generate().to_string();
    let date_str = d.format("%Y-%m-%d").to_string();
    let new_block = frontmatter::update_block(
        &block,
        eol,
        &Fields {
            id: &id,
            ty: "journal",
            date: &date_str,
            created: &created,
            modified: now,
        },
    );

    let mut out = String::with_capacity(new_block.len() + body.len() + 4);
    if bom {
        out.push('\u{feff}');
    }
    out.push_str(&new_block);
    if !new_block.ends_with('\n') && !body.is_empty() {
        out.push_str(eol);
    }
    out.push_str(body);

    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    StagedWrite::stage(&path, out.as_bytes())?.commit()?;

    let s = frontmatter::split(&out);
    Ok(SaveResult {
        status: SaveStatus::Saved,
        hash: hash_bytes(out.as_bytes()),
        created: frontmatter::get_value(s.block, "created"),
        modified: frontmatter::get_value(s.block, "modified"),
    })
}

/// Remove a day's file with `remove` (the app passes "move to the OS trash"; tests pass a plain
/// delete), then tidy up the month and year folders if that left them empty. Returns whether
/// there was a file to remove.
pub fn delete_day_with(
    vault: &Path,
    date: &str,
    remove: impl FnOnce(&Path) -> std::io::Result<()>,
) -> Result<bool, VaultError> {
    let path = day_path(vault, validate_date(date)?);
    if !path.is_file() {
        return Ok(false);
    }
    remove(&path)?;
    // `remove_dir` only succeeds on empty directories, so anything else in the folder is safe.
    for dir in path.ancestors().skip(1).take(2) {
        if fs::remove_dir(dir).is_err() {
            break;
        }
    }
    Ok(true)
}

/// `YYYY-MM-DD` if `name` is a visible `YYYY-MM-DD.md` file name.
pub fn date_from_file_name(name: &str) -> Option<String> {
    if name.starts_with('.') {
        return None;
    }
    let stem = name.strip_suffix(".md")?;
    validate_date(stem).ok()?;
    Some(stem.to_string())
}

pub fn list_days(vault: &Path, year: i32, month: u32) -> Vec<String> {
    if !(0..=9999).contains(&year) || !(1..=12).contains(&month) {
        return Vec::new();
    }
    let dir = vault
        .join("journal")
        .join(format!("{year:04}"))
        .join(format!("{month:02}"));
    let prefix = format!("{year:04}-{month:02}-");
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut days: Vec<String> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| date_from_file_name(&e.file_name().to_string_lossy()))
        .filter(|d| d.starts_with(&prefix))
        .collect();
    days.sort();
    days
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const NOW: &str = "2026-10-28T21:40:00-05:00";

    fn write(vault: &Path, date: &str, content: &str) -> PathBuf {
        let p = day_path(vault, validate_date(date).unwrap());
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, content).unwrap();
        p
    }

    #[test]
    fn date_validation() {
        assert!(validate_date("2026-10-28").is_ok());
        for bad in [
            "../x",
            "2026-13-01",
            "2026-02-30",
            "2026-1-01",
            "20261028",
            "2026-10-28 ",
            "",
            "2026/10/28",
            "..\\..\\evil",
            "２０２６-10-28",
        ] {
            assert!(validate_date(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn read_missing_day() {
        let dir = tempdir().unwrap();
        let d = read_day(dir.path(), "2026-10-28").unwrap();
        assert!(!d.exists);
        assert_eq!(d.hash, "");
        assert!(read_day(dir.path(), "../x").is_err());
    }

    #[test]
    fn empty_body_does_not_create_file_or_dirs() {
        let dir = tempdir().unwrap();
        let r = save_day_at(dir.path(), "2026-10-28", "  \n\n", None, false, NOW).unwrap();
        assert_eq!(r.status, SaveStatus::Skipped);
        assert!(!dir.path().join("journal").exists());
    }

    #[test]
    fn first_text_creates_file_with_frontmatter() {
        let dir = tempdir().unwrap();
        let r = save_day_at(dir.path(), "2026-10-28", "Hello\n", None, false, NOW).unwrap();
        assert_eq!(r.status, SaveStatus::Saved);
        assert_eq!(r.created.as_deref(), Some(NOW));
        assert_eq!(r.modified.as_deref(), Some(NOW));
        let p = day_path(dir.path(), validate_date("2026-10-28").unwrap());
        let text = fs::read_to_string(&p).unwrap();
        assert!(text.starts_with("---\nid: "));
        assert!(text.contains("\ntype: journal\ndate: 2026-10-28\ncreated: "));
        assert!(text.ends_with("---\nHello\n"));
        assert_eq!(r.hash, hash_bytes(text.as_bytes()));
        // No temp file left behind.
        assert!(!p.with_file_name(".2026-10-28.md.tmp").exists());

        let read = read_day(dir.path(), "2026-10-28").unwrap();
        assert!(read.exists);
        assert_eq!(read.body, "Hello\n");
        assert_eq!(read.hash, r.hash);
    }

    #[test]
    fn noop_save_writes_nothing() {
        let dir = tempdir().unwrap();
        let content = "---\nid: X\nmodified: 2020-01-01T00:00:00Z\n---\nSame\r\n";
        let p = write(dir.path(), "2026-10-28", content);
        let before = fs::metadata(&p).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        let r = save_day_at(dir.path(), "2026-10-28", "Same\r\n", None, false, NOW).unwrap();
        assert_eq!(r.status, SaveStatus::Skipped);
        assert_eq!(fs::read_to_string(&p).unwrap(), content);
        assert_eq!(fs::metadata(&p).unwrap().modified().unwrap(), before);
        assert_eq!(r.hash, hash_bytes(content.as_bytes()));
        assert_eq!(r.modified.as_deref(), Some("2020-01-01T00:00:00Z"));
    }

    #[test]
    fn edit_updates_only_modified_and_adds_missing_keys() {
        let dir = tempdir().unwrap();
        let content = "---\r\n# keep me\r\nid: X\r\ncreated: C\r\nmodified: old # c\r\nmood:\r\n  - { at: \"07:12\" }\r\n---\r\nOld\r\n";
        let p = write(dir.path(), "2026-10-28", content);
        let r = save_day_at(dir.path(), "2026-10-28", "New\r\n", None, false, NOW).unwrap();
        assert_eq!(r.status, SaveStatus::Saved);
        let text = fs::read_to_string(&p).unwrap();
        assert!(text.starts_with("---\r\n# keep me\r\nid: X\r\ncreated: C\r\nmodified: 2026-10-28T21:40:00-05:00 # c\r\nmood:\r\n  - { at: \"07:12\" }\r\ntype: journal\r\ndate: 2026-10-28\r\n---\r\nNew\r\n"));
        assert!(!text.replace("\r\n", "").contains('\n'));
        assert_eq!(r.created.as_deref(), Some("C"));
    }

    #[test]
    fn file_without_frontmatter_gets_block_and_keeps_body() {
        let dir = tempdir().unwrap();
        let p = write(dir.path(), "2026-10-28", "Phone note\n");
        let r = save_day_at(dir.path(), "2026-10-28", "Phone note\nmore\n", None, false, NOW).unwrap();
        assert_eq!(r.status, SaveStatus::Saved);
        let text = fs::read_to_string(&p).unwrap();
        assert!(text.starts_with("---\nid: "));
        assert!(text.ends_with("---\nPhone note\nmore\n"));
        // created comes from birth time when available, otherwise now.
        assert!(r.created.is_some());
    }

    #[test]
    fn bom_is_preserved() {
        let dir = tempdir().unwrap();
        let p = write(dir.path(), "2026-10-28", "\u{feff}---\nid: X\n---\nA\n");
        save_day_at(dir.path(), "2026-10-28", "B\n", None, false, NOW).unwrap();
        let text = fs::read_to_string(&p).unwrap();
        assert!(text.starts_with("\u{feff}---\nid: X\n"));
        assert!(text.ends_with("---\nB\n"));
        assert_eq!(text.matches('\u{feff}').count(), 1);
    }

    #[test]
    fn closing_delimiter_without_eol_gets_one_before_body() {
        let dir = tempdir().unwrap();
        let p = write(dir.path(), "2026-10-28", "---\nid: X\n---");
        save_day_at(dir.path(), "2026-10-28", "Hi\n", None, false, NOW).unwrap();
        assert!(fs::read_to_string(&p).unwrap().ends_with("---\nHi\n"));
    }

    #[test]
    fn conflict_when_hash_differs() {
        let dir = tempdir().unwrap();
        let p = write(dir.path(), "2026-10-28", "---\nid: X\n---\nOn disk\n");
        let r = save_day_at(dir.path(), "2026-10-28", "Mine\n", Some("stale"), false, NOW).unwrap();
        assert_eq!(r.status, SaveStatus::Conflict);
        assert_eq!(fs::read_to_string(&p).unwrap(), "---\nid: X\n---\nOn disk\n");

        let current = read_day(dir.path(), "2026-10-28").unwrap().hash;
        let ok = save_day_at(dir.path(), "2026-10-28", "Mine\n", Some(&current), false, NOW).unwrap();
        assert_eq!(ok.status, SaveStatus::Saved);

        let forced = save_day_at(dir.path(), "2026-10-28", "Forced\n", Some("stale"), true, NOW).unwrap();
        assert_eq!(forced.status, SaveStatus::Saved);
        assert!(fs::read_to_string(&p).unwrap().ends_with("Forced\n"));
    }

    #[test]
    fn conflict_when_file_deleted_on_disk() {
        let dir = tempdir().unwrap();
        let r = save_day_at(dir.path(), "2026-10-28", "Mine\n", Some("abc"), false, NOW).unwrap();
        assert_eq!(r.status, SaveStatus::Conflict);
        assert!(!dir.path().join("journal").exists());
        // Empty expected hash means "I believe the file doesn't exist".
        let ok = save_day_at(dir.path(), "2026-10-28", "Mine\n", Some(""), false, NOW).unwrap();
        assert_eq!(ok.status, SaveStatus::Saved);
    }

    #[test]
    fn staged_write_dropped_leaves_original_intact() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("2026-10-28.md");
        fs::write(&target, "original").unwrap();
        let tmp = dir.path().join(".2026-10-28.md.tmp");
        {
            let staged = StagedWrite::stage(&target, b"new content").unwrap();
            // Simulates a crash between write and rename: target untouched.
            assert_eq!(fs::read_to_string(&target).unwrap(), "original");
            assert!(tmp.exists());
            drop(staged);
        }
        assert_eq!(fs::read_to_string(&target).unwrap(), "original");
        assert!(!tmp.exists());
    }

    #[test]
    fn staged_write_commit_replaces_target() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("2026-10-28.md");
        fs::write(&target, "original").unwrap();
        StagedWrite::stage(&target, b"new content").unwrap().commit().unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "new content");
        assert!(!dir.path().join(".2026-10-28.md.tmp").exists());
    }

    #[test]
    fn delete_day_removes_file_and_empty_folders_only() {
        let dir = tempdir().unwrap();
        write(dir.path(), "2026-10-28", "a");
        write(dir.path(), "2026-10-29", "b");
        let rm = |p: &Path| fs::remove_file(p);

        assert!(delete_day_with(dir.path(), "2026-10-28", rm).unwrap());
        assert_eq!(list_days(dir.path(), 2026, 10), vec!["2026-10-29"]);
        // Already gone: nothing to do, not an error.
        assert!(!delete_day_with(dir.path(), "2026-10-28", rm).unwrap());
        // Last file out takes the empty month and year folders with it, but never the vault.
        assert!(delete_day_with(dir.path(), "2026-10-29", rm).unwrap());
        assert!(!dir.path().join("journal/2026").exists());
        assert!(dir.path().join("journal").exists());
        // Dates are validated, never treated as paths.
        assert!(delete_day_with(dir.path(), "../../etc/passwd", rm).is_err());
    }

    #[test]
    fn list_days_filters() {
        let dir = tempdir().unwrap();
        write(dir.path(), "2026-10-28", "a");
        write(dir.path(), "2026-10-02", "b");
        write(dir.path(), "2026-11-01", "c");
        let month = dir.path().join("journal/2026/10");
        fs::write(month.join(".2026-10-03.md.tmp"), "x").unwrap();
        fs::write(month.join(".2026-10-04.md"), "x").unwrap();
        fs::write(month.join("notes.md"), "x").unwrap();
        fs::write(month.join("2026-10-05.txt"), "x").unwrap();
        fs::write(month.join("2026-09-05.md"), "wrong month").unwrap();
        fs::create_dir(month.join("2026-10-06.md")).unwrap();
        assert_eq!(list_days(dir.path(), 2026, 10), vec!["2026-10-02", "2026-10-28"]);
        assert_eq!(list_days(dir.path(), 2026, 11), vec!["2026-11-01"]);
        assert!(list_days(dir.path(), 2025, 1).is_empty());
        assert!(list_days(dir.path(), 2026, 13).is_empty());
    }

    #[test]
    fn invalid_utf8_is_an_error_not_a_clobber() {
        let dir = tempdir().unwrap();
        let p = day_path(dir.path(), validate_date("2026-10-28").unwrap());
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, [0xff, 0xfe, 0x00, 0x41]).unwrap();
        assert!(save_day_at(dir.path(), "2026-10-28", "x", None, false, NOW).is_err());
        assert_eq!(fs::read(&p).unwrap(), vec![0xff, 0xfe, 0x00, 0x41]);
    }
}
