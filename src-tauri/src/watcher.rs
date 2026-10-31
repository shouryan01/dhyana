//! Watches the vault and tells the frontend which day files changed.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::index::SharedIndex;
use crate::vault::date_from_file_name;

pub const EVENT: &str = "vault://changed";
/// Entities, links or tags may have changed: refetch lists and backlinks.
pub const ENTITIES_EVENT: &str = "vault://entities";

#[derive(Serialize, Clone)]
struct Changed {
    dates: Vec<String>,
}

/// When the vault's files changed since the last version was recorded, so history can commit at
/// a quiet moment, or at least every so often while someone writes without pausing.
pub struct Activity {
    state: Mutex<Pending>,
}

#[derive(Default)]
struct Pending {
    /// The first change not yet recorded.
    since: Option<Instant>,
    /// The latest change.
    last: Option<Instant>,
}

impl Default for Activity {
    fn default() -> Self {
        Activity { state: Mutex::new(Pending::default()) }
    }
}

impl Activity {
    pub fn touch(&self) {
        if let Ok(mut s) = self.state.lock() {
            let now = Instant::now();
            s.since.get_or_insert(now);
            s.last = Some(now);
        }
    }

    /// True (once) if something changed and either nothing has for `quiet`, or the first
    /// unrecorded change is `max` old.
    pub fn take_if_due(&self, quiet: Duration, max: Duration) -> bool {
        let Ok(mut s) = self.state.lock() else { return false };
        let (Some(since), Some(last)) = (s.since, s.last) else { return false };
        if last.elapsed() >= quiet || since.elapsed() >= max {
            *s = Pending::default();
            return true;
        }
        false
    }
}

/// Keeps the watcher alive; dropping it stops watching.
pub struct VaultWatcher {
    _debouncer: Debouncer<notify::RecommendedWatcher>,
}

/// `YYYY-MM-DD` if `path` is `<vault>/journal/YYYY/MM/YYYY-MM-DD.md`.
pub fn date_for_path(vault: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(vault).ok()?;
    let parts: Vec<_> = rel.components().map(|c| c.as_os_str().to_string_lossy()).collect();
    if parts.len() != 4 || parts[0] != "journal" {
        return None;
    }
    let date = date_from_file_name(&parts[3])?;
    (date.starts_with(&format!("{}-{}-", parts[1], parts[2]))).then_some(date)
}

pub fn dates_for_paths<'a>(vault: &Path, paths: impl IntoIterator<Item = &'a PathBuf>) -> Vec<String> {
    let mut dates: Vec<String> = paths
        .into_iter()
        .filter_map(|p| date_for_path(vault, p))
        .collect();
    dates.sort();
    dates.dedup();
    dates
}

pub fn start(
    app: AppHandle,
    vault: PathBuf,
    shared: SharedIndex,
    activity: Arc<Activity>,
) -> Result<VaultWatcher, String> {
    let root = vault.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(250),
        move |res: DebounceEventResult| {
            if let Ok(events) = res {
                let paths: Vec<PathBuf> = events.into_iter().map(|e| e.path).collect();
                if !paths.is_empty() {
                    activity.touch();
                }
                // Keep the index in step with the files, whoever changed them.
                let refreshed = match shared.lock() {
                    Ok(mut slot) => slot
                        .as_mut()
                        .filter(|v| v.vault == root)
                        .and_then(|v| v.refresh_paths(&paths).ok())
                        .unwrap_or_default(),
                    Err(_) => Vec::new(),
                };
                let dates = dates_for_paths(&root, &paths);
                if !dates.is_empty() {
                    let _ = app.emit(EVENT, Changed { dates });
                }
                if !refreshed.is_empty() {
                    let _ = app.emit(ENTITIES_EVENT, ());
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;
    debouncer
        .watcher()
        .watch(&vault, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    Ok(VaultWatcher {
        _debouncer: debouncer,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_day_files_only() {
        let v = Path::new("/vault");
        let ok = v.join("journal").join("2026").join("10").join("2026-10-28.md");
        assert_eq!(date_for_path(v, &ok).as_deref(), Some("2026-10-28"));

        for p in [
            v.join("journal/2026/10/.2026-10-28.md.tmp"),
            v.join("journal/2026/10/2026-10-28.md.tmp"),
            v.join("journal/2026/10/.2026-10-28.md"),
            v.join("journal/2026/09/2026-10-28.md"),
            v.join("journal/2026/10"),
            v.join("people/Alice.md"),
            PathBuf::from("/elsewhere/journal/2026/10/2026-10-28.md"),
        ] {
            assert_eq!(date_for_path(v, &p), None, "{p:?}");
        }
    }

    #[test]
    fn activity_is_due_when_quiet_or_when_it_has_waited_too_long() {
        let hour = Duration::from_secs(3600);
        let a = Activity::default();
        assert!(!a.take_if_due(Duration::ZERO, Duration::ZERO), "nothing changed yet");
        a.touch();
        assert!(!a.take_if_due(hour, hour), "neither quiet nor old enough");
        assert!(a.take_if_due(Duration::ZERO, hour), "quiet long enough");
        assert!(!a.take_if_due(Duration::ZERO, Duration::ZERO), "already taken");
        // Still typing (changes keep arriving, so never quiet), but the first one is old enough.
        a.touch();
        assert!(a.take_if_due(hour, Duration::ZERO), "waited too long");
    }

    #[test]
    fn dedups_and_sorts() {
        let v = Path::new("/vault");
        let a = v.join("journal/2026/10/2026-10-28.md");
        let b = v.join("journal/2026/10/2026-10-02.md");
        let tmp = v.join("journal/2026/10/.2026-10-28.md.tmp");
        assert_eq!(
            dates_for_paths(v, [&a, &b, &a, &tmp]),
            vec!["2026-10-02", "2026-10-28"]
        );
    }
}
