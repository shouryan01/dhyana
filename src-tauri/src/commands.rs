//! Tauri commands. Thin wrappers over `settings` and `vault`.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::settings::{Settings, SettingsPatch};
use crate::vault::{self, DayFile, SaveResult};
use crate::watcher::{self, VaultWatcher};

pub struct AppCtx {
    pub settings_path: PathBuf,
    pub settings: Mutex<Settings>,
    pub watcher: Mutex<Option<VaultWatcher>>,
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
    pub fn new(settings_path: PathBuf) -> Self {
        let settings = Settings::load(&settings_path);
        AppCtx {
            settings_path,
            settings: Mutex::new(settings),
            watcher: Mutex::new(None),
        }
    }

    fn vault(&self) -> Result<PathBuf, String> {
        self.settings
            .lock()
            .map_err(|e| e.to_string())?
            .existing_vault()
            .ok_or_else(|| "no vault configured".to_string())
    }

    /// (Re)start the watcher for the saved vault, if any.
    pub fn restart_watcher(&self, app: &AppHandle) {
        let vault = self.vault().ok();
        let new = vault.and_then(|v| match watcher::start(app.clone(), v) {
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
    vault::save_day(&ctx.vault()?, &date, &body, expected_hash.as_deref(), force)
        .map_err(|e| e.to_string())
}

/// Moves the day's file to the OS trash (recoverable), not a hard delete.
#[tauri::command]
pub fn delete_day(ctx: State<AppCtx>, date: String) -> Result<bool, String> {
    vault::delete_day_with(&ctx.vault()?, &date, |p| {
        trash::delete(p).map_err(|e| std::io::Error::other(e.to_string()))
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_days(ctx: State<AppCtx>, year: i32, month: u32) -> Result<Vec<String>, String> {
    Ok(vault::list_days(&ctx.vault()?, year, month))
}
