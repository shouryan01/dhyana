//! Tauri commands. Thin wrappers over `settings`, `vault`, `entities` and the index.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::entities::{self, EntityDetail, EntityPatch, RenameResult};
use crate::index::{EntitySummary, Index, Mention, SharedIndex, TagInfo, UpcomingEvent, VaultIndex};
use crate::names::Kind;
use crate::settings::{Settings, SettingsPatch};
use crate::vault::{self, DayFile, SaveResult, SaveStatus};
use crate::watcher::{self, VaultWatcher};

pub struct AppCtx {
    pub settings_path: PathBuf,
    /// Where per-vault index files live (app data, never the vault).
    pub index_dir: PathBuf,
    pub settings: Mutex<Settings>,
    pub watcher: Mutex<Option<VaultWatcher>>,
    pub index: SharedIndex,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub onboarding_completed: bool,
    pub vault_path: Option<String>,
    pub theme: String,
    pub font: String,
}

impl AppState {
    fn from(s: &Settings) -> Self {
        AppState {
            onboarding_completed: s.onboarding_completed,
            vault_path: s
                .existing_vault()
                .map(|p| p.display().to_string()),
            theme: s.theme.clone(),
            font: s.font.clone(),
        }
    }
}

impl AppCtx {
    pub fn new(settings_path: PathBuf, index_dir: PathBuf) -> Self {
        let settings = Settings::load(&settings_path);
        AppCtx {
            settings_path,
            index_dir,
            settings: Mutex::new(settings),
            watcher: Mutex::new(None),
            index: Arc::new(Mutex::new(None)),
        }
    }

    fn vault(&self) -> Result<PathBuf, String> {
        self.settings
            .lock()
            .map_err(|e| e.to_string())?
            .existing_vault()
            .ok_or_else(|| "no vault configured".to_string())
    }

    /// Seed the vault's defaults, then open its index and bring it up to date.
    pub fn open_index(&self) {
        let opened = self.vault().ok().and_then(|v| {
            if let Err(e) = entities::ensure_seeded(&v) {
                eprintln!("dhyana: could not seed vault: {e}");
            }
            match VaultIndex::open(&v, &self.index_dir) {
                Ok(i) => Some(i),
                Err(e) => {
                    eprintln!("dhyana: could not open index: {e}");
                    None
                }
            }
        });
        if let Ok(mut slot) = self.index.lock() {
            *slot = opened;
        }
    }

    /// Run `f` against the open vault and its index.
    fn with_index<T>(
        &self,
        f: impl FnOnce(&Path, &mut Index) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut slot = self.index.lock().map_err(|e| e.to_string())?;
        let open = slot.as_mut().ok_or_else(|| "the index is not available".to_string())?;
        f(&open.vault.clone(), &mut open.index)
    }

    /// (Re)start the watcher for the saved vault, if any.
    pub fn restart_watcher(&self, app: &AppHandle) {
        let vault = self.vault().ok();
        let shared = self.index.clone();
        let new = vault.and_then(|v| match watcher::start(app.clone(), v, shared) {
            Ok(w) => Some(w),
            Err(e) => {
                eprintln!("dhyana: could not watch vault: {e}");
                None
            }
        });
        if let Ok(mut slot) = self.watcher.lock() {
            *slot = new;
        }
    }
}

#[tauri::command]
pub fn get_app_state(ctx: State<AppCtx>) -> Result<AppState, String> {
    let s = ctx.settings.lock().map_err(|e| e.to_string())?;
    Ok(AppState::from(&s))
}

#[tauri::command]
pub fn update_settings(ctx: State<AppCtx>, patch: SettingsPatch) -> Result<AppState, String> {
    let mut s = ctx.settings.lock().map_err(|e| e.to_string())?;
    s.apply(patch);
    s.save(&ctx.settings_path).map_err(|e| e.to_string())?;
    Ok(AppState::from(&s))
}

#[tauri::command]
pub fn default_vault_path(app: AppHandle) -> String {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| PathBuf::from("."));
    base.join("dhyana").display().to_string()
}

#[tauri::command]
pub fn set_vault(app: AppHandle, ctx: State<AppCtx>, path: String) -> Result<AppState, String> {
    let dir = PathBuf::from(&path);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let state = {
        let mut s = ctx.settings.lock().map_err(|e| e.to_string())?;
        s.vault_path = Some(path);
        s.save(&ctx.settings_path).map_err(|e| e.to_string())?;
        AppState::from(&s)
    };
    ctx.open_index();
    ctx.restart_watcher(&app);
    Ok(state)
}

#[tauri::command]
pub fn read_day(ctx: State<AppCtx>, date: String) -> Result<DayFile, String> {
    vault::read_day(&ctx.vault()?, &date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_day(
    ctx: State<AppCtx>,
    date: String,
    body: String,
    expected_hash: Option<String>,
    force: bool,
) -> Result<SaveResult, String> {
    let vault_dir = ctx.vault()?;
    let res = vault::save_day(&vault_dir, &date, &body, expected_hash.as_deref(), force)
        .map_err(|e| e.to_string())?;
    if res.status == SaveStatus::Saved {
        // Backlinks and upcoming dates reflect this save immediately, not after the watcher fires.
        let path = vault::day_path(&vault_dir, vault::validate_date(&date).map_err(|e| e.to_string())?);
        if let Ok(mut slot) = ctx.index.lock() {
            if let Some(open) = slot.as_mut() {
                let _ = open.refresh_paths([&path]);
            }
        }
    }
    Ok(res)
}

/// Moves the day's file to the OS trash (recoverable), not a hard delete.
#[tauri::command]
pub fn delete_day(ctx: State<AppCtx>, date: String) -> Result<bool, String> {
    let vault_dir = ctx.vault()?;
    let removed = vault::delete_day_with(&vault_dir, &date, |p| {
        trash::delete(p).map_err(|e| std::io::Error::other(e.to_string()))
    })
    .map_err(|e| e.to_string())?;
    if removed {
        let path = vault::day_path(&vault_dir, vault::validate_date(&date).map_err(|e| e.to_string())?);
        if let Ok(mut slot) = ctx.index.lock() {
            if let Some(open) = slot.as_mut() {
                let _ = open.refresh_paths([&path]);
            }
        }
    }
    Ok(removed)
}

#[tauri::command]
pub fn list_days(ctx: State<AppCtx>, year: i32, month: u32) -> Result<Vec<String>, String> {
    Ok(vault::list_days(&ctx.vault()?, year, month))
}

#[tauri::command]
pub fn list_years(ctx: State<AppCtx>) -> Result<Vec<i32>, String> {
    Ok(vault::list_years(&ctx.vault()?))
}

#[tauri::command]
pub fn list_entities(ctx: State<AppCtx>) -> Result<Vec<EntitySummary>, String> {
    ctx.with_index(|_, idx| idx.entities().map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn list_tags(ctx: State<AppCtx>) -> Result<Vec<TagInfo>, String> {
    ctx.with_index(|_, idx| idx.tags().map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn get_entity(ctx: State<AppCtx>, path: String) -> Result<EntityDetail, String> {
    ctx.with_index(|v, idx| entities::detail(v, idx, &path).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn create_entity(ctx: State<AppCtx>, kind: String, name: String) -> Result<EntitySummary, String> {
    let kind = Kind::parse(&kind).ok_or_else(|| format!("unknown kind: {kind}"))?;
    ctx.with_index(|v, idx| entities::create(v, idx, kind, &name).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn update_entity(ctx: State<AppCtx>, path: String, patch: EntityPatch) -> Result<EntityDetail, String> {
    ctx.with_index(|v, idx| entities::update(v, idx, &path, patch).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn rename_entity(ctx: State<AppCtx>, path: String, new_name: String) -> Result<RenameResult, String> {
    ctx.with_index(|v, idx| entities::rename(v, idx, &path, &new_name).map_err(|e| e.to_string()))
}

/// Moves a person, place, emotion or note to the OS trash (recoverable), not a hard delete.
#[tauri::command]
pub fn delete_entity(ctx: State<AppCtx>, path: String) -> Result<(), String> {
    ctx.with_index(|v, idx| {
        entities::delete(v, idx, &path, |p| {
            trash::delete(p).map_err(|e| std::io::Error::other(e.to_string()))
        })
        .map_err(|e| e.to_string())
    })
}

/// Notes that use `#tag`, newest journal days first, each with the line that mentions it.
#[tauri::command]
pub fn tag_notes(ctx: State<AppCtx>, tag: String) -> Result<Vec<Mention>, String> {
    ctx.with_index(|v, idx| entities::tag_notes(v, idx, &tag).map_err(|e| e.to_string()))
}

/// Clears the library back to a fresh vault's (see `entities::reset_library`); files go to the OS trash.
#[tauri::command]
pub fn reset_library(ctx: State<AppCtx>) -> Result<usize, String> {
    ctx.with_index(|v, idx| {
        entities::reset_library(v, idx, |p| {
            trash::delete(p).map_err(|e| std::io::Error::other(e.to_string()))
        })
        .map_err(|e| e.to_string())
    })
}

/// `$date` events on or after `from` (YYYY-MM-DD), soonest first.
#[tauri::command]
pub fn upcoming(ctx: State<AppCtx>, from: String, limit: Option<usize>) -> Result<Vec<UpcomingEvent>, String> {
    vault::validate_date(&from).map_err(|e| e.to_string())?;
    ctx.with_index(|_, idx| idx.upcoming(&from, limit.unwrap_or(50).min(500)).map_err(|e| e.to_string()))
}

/// Throw the index away and rebuild it from the files.
#[tauri::command]
pub fn rebuild_index(ctx: State<AppCtx>) -> Result<(), String> {
    ctx.with_index(|v, idx| idx.rebuild(v).map_err(|e| e.to_string()))
}
