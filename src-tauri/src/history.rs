//! Version history with git2-rs.
//!
//! The repository is bare and lives in app data, named by vault id, so nothing is ever written
//! inside the vault, and a `.git` folder the user keeps in the vault is never read or touched (it
//! is hidden, like `.dhyana/` and `.obsidian/`, so it is not even part of the snapshot). Commits
//! are built straight from the files on disk (blobs and trees), with no git index or checkout.
//!
//! - **Autocommit**: every time the files have changed and gone quiet (see `lib.rs`), plus on quit,
//!   the changes become a new version. Nothing is amended or squashed, so a note's history is a
//!   continuous stream of what it was at each pause.
//! - **Checkpoint**: a commit of the current files under a reason. Restores use it (before and
//!   after), and AI edits will (0.6).

use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use chrono::{Local, SecondsFormat, TimeZone};
use git2::{Commit, Delta, Oid, Repository, RepositoryInitOptions, Signature, Sort};
use serde::Serialize;

use crate::index::{classify, vault_id};
use crate::vault::{StagedWrite, VaultError};

const BRANCH: &str = "refs/heads/main";
/// Bigger files (videos, archives) are left out of history.
const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;
/// How far back the per-note history looks.
const MAX_SCAN: usize = 5000;

#[derive(Debug, thiserror::Error)]
pub enum HistoryError {
    #[error("history error: {0}")]
    Git(#[from] git2::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Vault(#[from] VaultError),
    #[error("not a note path: {0}")]
    BadPath(String),
    #[error("that version has no copy of {0}")]
    NoContent(String),
}

type Result<T> = std::result::Result<T, HistoryError>;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub id: String,
    /// RFC 3339, local time.
    pub time: String,
    /// The commit's first line.
    pub message: String,
    /// The note was removed in this version.
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VersionContent {
    /// The note as of this version (`None` if it was deleted in it).
    pub text: Option<String>,
    /// The note just before this version, if it existed.
    pub previous: Option<String>,
    /// The note on disk now.
    pub current: Option<String>,
}

pub struct History {
    repo: Repository,
    vault: PathBuf,
    /// Blob ids of files already hashed, by vault-relative path: `(mtime ns, size, blob)`.
    blobs: HashMap<String, (i64, u64, Oid)>,
}

fn mtime_ns(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_nanos() as i64)
}

/// A vault-relative note path (`journal/2026/10/2026-10-30.md`, `people/Alice.md`), checked so it
/// can't reach outside the vault.
fn note_path(rel: &str) -> Result<&str> {
    let normal = Path::new(rel).components().all(|c| matches!(c, Component::Normal(_)));
    if normal && classify(rel).is_some() {
        Ok(rel)
    } else {
        Err(HistoryError::BadPath(rel.to_string()))
    }
}

/// How a path is named in commit messages: a journal day by its date, a note by its name.
fn display_name(rel: &str) -> String {
    let file = rel.rsplit('/').next().unwrap_or(rel);
    file.strip_suffix(".md").unwrap_or(file).to_string()
}

/// Borrows only the repository, so it can be held while the cached blobs are updated.
fn head_of(repo: &Repository) -> Option<Commit<'_>> {
    repo.head().ok()?.peel_to_commit().ok()
}

fn summary_of(c: &Commit) -> String {
    String::from_utf8_lossy(c.message_bytes()).lines().next().unwrap_or_default().to_string()
}

fn time_of(c: &Commit) -> String {
    Local
        .timestamp_opt(c.time().seconds(), 0)
        .single()
        .map(|t| t.to_rfc3339_opts(SecondsFormat::Secs, false))
        .unwrap_or_default()
}

/// The tree for `dir`, or `None` if it holds nothing we keep. Hidden entries (`.git`, `.dhyana`,
/// `.obsidian`, `.trash`, our own `.name.tmp` files) and symlinks are skipped.
fn tree_for(
    repo: &Repository,
    blobs: &mut HashMap<String, (i64, u64, Oid)>,
    dir: &Path,
    prefix: &str,
) -> Result<Option<Oid>> {
    let Ok(rd) = fs::read_dir(dir) else { return Ok(None) };
    let mut tb = repo.treebuilder(None)?;
    for e in rd.flatten() {
        let Ok(name) = e.file_name().into_string() else { continue };
        let Ok(ft) = e.file_type() else { continue };
        if name.starts_with('.') {
            continue;
        }
        let rel = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        if ft.is_dir() {
            if let Some(t) = tree_for(repo, blobs, &e.path(), &rel)? {
                tb.insert(&name, t, 0o040000)?;
            }
        } else if ft.is_file() {
            let Ok(meta) = e.metadata() else { continue };
            if meta.len() > MAX_FILE_BYTES {
                continue;
            }
            let stamp = (mtime_ns(&meta), meta.len());
            let oid = match blobs.get(&rel) {
                Some(&(m, s, oid)) if (m, s) == stamp => oid,
                _ => {
                    let Ok(bytes) = fs::read(e.path()) else { continue };
                    let oid = repo.blob(&bytes)?;
                    blobs.insert(rel, (stamp.0, stamp.1, oid));
                    oid
                }
            };
            tb.insert(&name, oid, 0o100644)?;
        }
    }
    if tb.is_empty() {
        return Ok(None);
    }
    Ok(Some(tb.write()?))
}

impl History {
    /// Open the vault's history in `dir` (app data), creating the repository the first time.
    pub fn open(vault: &Path, dir: &Path) -> Result<History> {
        let path = dir.join(format!("{}.git", vault_id(vault)));
        let repo = if path.join("HEAD").is_file() {
            Repository::open_bare(&path)?
        } else {
            fs::create_dir_all(&path)?;
            let mut opts = RepositoryInitOptions::new();
            opts.bare(true).initial_head("main");
            Repository::init_opts(&path, &opts)?
        };
        Ok(History { repo, vault: vault.to_path_buf(), blobs: HashMap::new() })
    }

    fn head(&self) -> Option<Commit<'_>> {
        head_of(&self.repo)
    }

    /// The tree of the vault as it is on disk now.
    fn snapshot(&mut self) -> Result<Oid> {
        let vault = self.vault.clone();
        match tree_for(&self.repo, &mut self.blobs, &vault, "")? {
            Some(t) => Ok(t),
            None => Ok(self.repo.treebuilder(None)?.write()?),
        }
    }

    /// `A path` / `M path` / `D path` lines for what changed between two trees.
    fn changes(&self, from: Option<Oid>, to: Oid) -> Result<Vec<(Delta, String)>> {
        let old = from.map(|t| self.repo.find_tree(t)).transpose()?;
        let new = self.repo.find_tree(to)?;
        let diff = self.repo.diff_tree_to_tree(old.as_ref(), Some(&new), None)?;
        Ok(diff
            .deltas()
            .filter_map(|d| {
                let file = if d.status() == Delta::Deleted { d.old_file() } else { d.new_file() };
                Some((d.status(), file.path()?.to_string_lossy().replace('\\', "/")))
            })
            .collect())
    }

    /// A generated message: "Edit 2026-10-30, Alice and 2 more", then one line per file.
    fn message(&self, title: Option<&str>, from: Option<Oid>, to: Oid) -> Result<String> {
        let changes = self.changes(from, to)?;
        let names: Vec<String> = changes.iter().map(|(_, p)| display_name(p)).collect();
        let verb = if changes.iter().all(|(s, _)| *s == Delta::Added) {
            "Add"
        } else if changes.iter().all(|(s, _)| *s == Delta::Deleted) {
            "Remove"
        } else {
            "Edit"
        };
        let generated = match names.len() {
            0 => "No changes".to_string(),
            1..=3 => format!("{verb} {}", names.join(", ")),
            n => format!("{verb} {} and {} more", names[..2].join(", "), n - 2),
        };
        let mut out = title.map(str::to_string).unwrap_or(generated);
        if !changes.is_empty() {
            out.push_str("\n\n");
            for (status, path) in &changes {
                let mark = match status {
                    Delta::Added => 'A',
                    Delta::Deleted => 'D',
                    _ => 'M',
                };
                out.push_str(&format!("{mark} {path}\n"));
            }
        }
        Ok(out)
    }

    fn commit(&self, tree: Oid, parent: Option<&Commit>, message: &str) -> Result<Oid> {
        let sig = Signature::now("dhyana", "dhyana@localhost")?;
        let tree = self.repo.find_tree(tree)?;
        let parents: Vec<&Commit> = parent.into_iter().collect();
        let oid = self.repo.commit(None, &sig, &sig, message, &tree, &parents)?;
        self.repo.reference(BRANCH, oid, true, "dhyana")?;
        Ok(oid)
    }

    /// Record whatever changed since the last version as a new one. Returns the new commit, or
    /// `None` when there was nothing to record.
    pub fn autocommit(&mut self) -> Result<Option<Oid>> {
        let tree = self.snapshot()?;
        let head = head_of(&self.repo);
        if head.as_ref().map(|h| h.tree_id()) == Some(tree) {
            return Ok(None);
        }
        if head.is_none() && self.repo.find_tree(tree)?.is_empty() {
            return Ok(None); // an empty vault: nothing to start history with
        }
        let from = head.as_ref().map(|h| h.tree_id());
        let message = self.message(None, from, tree)?;
        Ok(Some(self.commit(tree, head.as_ref(), &message)?))
    }

    /// Record the files as they are now under `reason`. Returns the commit holding this state
    /// (the existing head if nothing changed), or `None` if there is no history at all yet.
    pub fn checkpoint(&mut self, reason: &str) -> Result<Option<Oid>> {
        let tree = self.snapshot()?;
        let head = head_of(&self.repo);
        if let Some(h) = &head {
            if h.tree_id() == tree {
                return Ok(Some(h.id()));
            }
        }
        let message = self.message(Some(reason), head.as_ref().map(|h| h.tree_id()), tree)?;
        Ok(Some(self.commit(tree, head.as_ref(), &message)?))
    }

    fn blob_at(&self, c: &Commit, rel: &str) -> Option<Oid> {
        c.tree().ok()?.get_path(Path::new(rel)).ok().map(|e| e.id())
    }

    fn text_at(&self, c: &Commit, rel: &str) -> Result<Option<String>> {
        let Some(oid) = self.blob_at(c, rel) else { return Ok(None) };
        let blob = self.repo.find_blob(oid)?;
        Ok(Some(String::from_utf8_lossy(blob.content()).into_owned()))
    }

    /// The versions of one note, newest first: every commit on the main line that changed it.
    pub fn versions(&self, rel: &str, limit: usize) -> Result<Vec<Version>> {
        let rel = note_path(rel)?;
        if self.head().is_none() {
            return Ok(Vec::new());
        }
        let mut walk = self.repo.revwalk()?;
        walk.push_head()?;
        walk.simplify_first_parent()?;
        walk.set_sorting(Sort::TOPOLOGICAL)?; // several commits can share a second
        let mut out = Vec::new();
        for oid in walk.take(MAX_SCAN) {
            let c = self.repo.find_commit(oid?)?;
            let here = self.blob_at(&c, rel);
            let before = c.parent(0).ok().and_then(|p| self.blob_at(&p, rel));
            if here == before {
                continue;
            }
            out.push(Version {
                id: c.id().to_string(),
                time: time_of(&c),
                message: summary_of(&c),
                deleted: here.is_none(),
            });
            if out.len() >= limit {
                break;
            }
        }
        Ok(out)
    }

    pub fn content(&self, rel: &str, id: &str) -> Result<VersionContent> {
        let rel = note_path(rel)?;
        let c = self.repo.find_commit(Oid::from_str(id)?)?;
        let previous = match c.parent(0) {
            Ok(p) => self.text_at(&p, rel)?,
            Err(_) => None,
        };
        Ok(VersionContent {
            text: self.text_at(&c, rel)?,
            previous,
            current: fs::read_to_string(self.vault.join(rel)).ok(),
        })
    }

    /// Put a note back the way it was in version `id`. The current files are checkpointed first,
    /// so restoring never loses anything, and the restore itself is a new commit.
    pub fn restore(&mut self, rel: &str, id: &str) -> Result<()> {
        let rel = note_path(rel)?;
        let (bytes, when) = {
            let c = self.repo.find_commit(Oid::from_str(id)?)?;
            let oid = self.blob_at(&c, rel).ok_or_else(|| HistoryError::NoContent(rel.to_string()))?;
            let when = Local
                .timestamp_opt(c.time().seconds(), 0)
                .single()
                .map(|t| t.format("%Y-%m-%d %H:%M").to_string())
                .unwrap_or_default();
            (self.repo.find_blob(oid)?.content().to_vec(), when)
        };
        let name = display_name(rel);
        self.checkpoint(&format!("Before restoring {name}"))?;
        let abs = self.vault.join(rel);
        if let Some(dir) = abs.parent() {
            fs::create_dir_all(dir)?;
        }
        StagedWrite::stage(&abs, &bytes)?.commit()?;
        self.checkpoint(&format!("Restore {name} to the version from {when}"))?;
        Ok(())
    }

    /// First lines of the main-line log, newest first (for tests and debugging).
    #[cfg(test)]
    fn log(&self) -> Vec<String> {
        let Ok(mut walk) = self.repo.revwalk() else { return Vec::new() };
        if walk.push_head().is_err() {
            return Vec::new();
        }
        walk.flatten()
            .filter_map(|o| self.repo.find_commit(o).ok())
            .map(|c| summary_of(&c))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::{tempdir, TempDir};

    fn put(v: &Path, rel: &str, text: &str) {
        let p = v.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }


    fn setup() -> (TempDir, TempDir, History) {
        let vault = tempdir().unwrap();
        let app = tempdir().unwrap();
        let h = History::open(vault.path(), app.path()).unwrap();
        (vault, app, h)
    }

    const DAY: &str = "journal/2026/10/2026-10-30.md";

    #[test]
    fn nothing_is_written_inside_the_vault() {
        let (vault, app, mut h) = setup();
        put(vault.path(), DAY, "hi");
        put(vault.path(), ".git/HEAD", "ref: refs/heads/theirs\n");
        put(vault.path(), ".obsidian/app.json", "{}");
        put(vault.path(), ".dhyana/settings.json", "{}");
        h.autocommit().unwrap().unwrap();
        let top: Vec<String> = fs::read_dir(vault.path()).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        let mut top = top;
        top.sort();
        assert_eq!(top, vec![".dhyana", ".git", ".obsidian", "journal"]);
        assert_eq!(fs::read_to_string(vault.path().join(".git/HEAD")).unwrap(), "ref: refs/heads/theirs\n");
        let head = h.head().unwrap();
        let tree = head.tree().unwrap();
        assert!(tree.get_name(".obsidian").is_none() && tree.get_name(".git").is_none() && tree.get_name(".dhyana").is_none());
        assert!(tree.get_path(Path::new(DAY)).is_ok());
        assert!(app.path().join(format!("{}.git", vault_id(vault.path()))).join("HEAD").is_file());
    }

    #[test]
    fn every_pause_is_a_new_version_and_nothing_is_squashed() {
        let (vault, app, mut h) = setup();
        assert!(h.autocommit().unwrap().is_none(), "empty vault: no commit");
        put(vault.path(), DAY, "one");
        h.autocommit().unwrap().unwrap();
        put(vault.path(), DAY, "two");
        put(vault.path(), "people/Alice.md", "---\ntype: person\n---\n");
        h.autocommit().unwrap().unwrap();
        assert!(h.autocommit().unwrap().is_none(), "nothing new");
        put(vault.path(), DAY, "three");
        h.autocommit().unwrap().unwrap();
        // Same day, same session: still one version per pause.
        assert_eq!(h.log(), vec!["Edit 2026-10-30", "Edit 2026-10-30, Alice", "Add 2026-10-30"]);

        // The note's own history is that continuous stream, newest first.
        let vs = h.versions(DAY, 50).unwrap();
        assert_eq!(vs.len(), 3);
        let texts: Vec<_> = vs.iter().map(|v| h.content(DAY, &v.id).unwrap().text.unwrap()).collect();
        assert_eq!(texts, vec!["three", "two", "one"]);

        // A new session carries on from the same log.
        let mut next = History::open(vault.path(), app.path()).unwrap();
        put(vault.path(), DAY, "four");
        next.autocommit().unwrap().unwrap();
        assert_eq!(next.log().len(), 4);
    }

    #[test]
    fn checkpoints_carry_their_reason_and_are_not_repeated() {
        let (vault, _app, mut h) = setup();
        put(vault.path(), DAY, "one");
        h.autocommit().unwrap();
        put(vault.path(), DAY, "two");
        let cp = h.checkpoint("Before AI edit").unwrap().unwrap();
        assert_eq!(h.checkpoint("again").unwrap(), Some(cp), "unchanged: same commit");
        put(vault.path(), DAY, "three");
        h.autocommit().unwrap();
        assert_eq!(h.log(), vec!["Edit 2026-10-30", "Before AI edit", "Add 2026-10-30"]);
    }
    #[test]
    fn versions_content_and_restore() {
        let (vault, _app, mut h) = setup();
        put(vault.path(), DAY, "v1\n");
        h.autocommit().unwrap();
        put(vault.path(), "people/Bob.md", "bob");
        h.autocommit().unwrap(); // doesn't touch the day
        put(vault.path(), DAY, "v2\n");
        h.autocommit().unwrap();

        let vs = h.versions(DAY, 50).unwrap();
        assert_eq!(vs.len(), 2);
        assert_eq!(vs[0].message, "Edit 2026-10-30");
        assert!(!vs[0].deleted);
        let newest = h.content(DAY, &vs[0].id).unwrap();
        assert_eq!((newest.text.as_deref(), newest.previous.as_deref()), (Some("v2\n"), Some("v1\n")));
        let oldest = h.content(DAY, &vs[1].id).unwrap();
        assert_eq!((oldest.text.as_deref(), oldest.previous), (Some("v1\n"), None));

        put(vault.path(), DAY, "unsaved thoughts\n");
        h.restore(DAY, &vs[1].id).unwrap();
        assert_eq!(fs::read_to_string(vault.path().join(DAY)).unwrap(), "v1\n");
        let log = h.log();
        assert!(log[0].starts_with("Restore 2026-10-30 to the version from "), "{log:?}");
        assert_eq!(log[1], "Before restoring 2026-10-30");
        // Nothing was lost: the text that was on disk is a version of its own.
        let vs = h.versions(DAY, 50).unwrap();
        assert_eq!(h.content(DAY, &vs[1].id).unwrap().text.as_deref(), Some("unsaved thoughts\n"));
    }

    #[test]
    fn deletions_are_versions_and_paths_are_checked() {
        let (vault, _app, mut h) = setup();
        put(vault.path(), "people/Bob.md", "bob");
        put(vault.path(), DAY, "x");
        h.autocommit().unwrap();
        fs::remove_file(vault.path().join("people/Bob.md")).unwrap();
        h.autocommit().unwrap();
        let vs = h.versions("people/Bob.md", 50).unwrap();
        assert_eq!(vs.iter().map(|v| v.deleted).collect::<Vec<_>>(), vec![true, false]);
        assert_eq!(vs[0].message, "Remove Bob");
        assert!(matches!(h.restore("people/Bob.md", &vs[0].id), Err(HistoryError::NoContent(_))));
        h.restore("people/Bob.md", &vs[1].id).unwrap();
        assert_eq!(fs::read_to_string(vault.path().join("people/Bob.md")).unwrap(), "bob");
        for bad in ["../outside.md", "people/../../x.md", "settings.json", "/etc/passwd"] {
            assert!(h.versions(bad, 5).is_err(), "{bad}");
            assert!(h.restore(bad, &vs[1].id).is_err(), "{bad}");
        }
    }
}
