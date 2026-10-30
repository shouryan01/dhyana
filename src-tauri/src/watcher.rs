//! Watches the vault and tells the frontend which day files changed.

use std::path::{Path, PathBuf};
use std::time::Duration;

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

pub fn start(app: AppHandle, vault: PathBuf, shared: SharedIndex) -> Result<VaultWatcher, String> {
    let root = vault.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(250),
        move |res: DebounceEventResult| {
            if let Ok(events) = res {
                let paths: Vec<PathBuf> = events.into_iter().map(|e| e.path).collect();
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
