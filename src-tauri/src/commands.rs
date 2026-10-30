//! Tauri commands. Thin wrappers over `settings`, `vault`, `entities`, `mood`, `history` and the index.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::entities::{self, EntityDetail, EntityPatch, RenameResult};
use crate::frontmatter;
use crate::history::{History, Version, VersionContent};
use crate::index::{
    vault_id, DayStat, EntitySummary, Index, Mention, SharedIndex, TagInfo, UpcomingEvent, VaultIndex,
};
use crate::mood::{self, CheckIn, MoodStore};
use crate::names::{self, Kind};
use crate::settings::{Settings, SettingsPatch};
use crate::vault::{self, DayFile, SaveResult, SaveStatus};
use crate::watcher::{self, Activity, VaultWatcher};

pub type SharedHistory = Arc<Mutex<Option<History>>>;

pub struct AppCtx {
    pub settings_path: PathBuf,
    /// Where per-vault index files live (app data, never the vault).
    pub index_dir: PathBuf,
    /// Per-vault pending check-ins and the "offered today" ledger (app data).
    pub mood_dir: PathBuf,
    /// Per-vault bare git repositories (app data).
    pub history_dir: PathBuf,
    pub settings: Mutex<Settings>,
    pub watcher: Mutex<Option<VaultWatcher>>,
    pub index: SharedIndex,
    pub mood: Mutex<Option<MoodStore>>,
    pub history: SharedHistory,
    /// Changes the watcher has seen since the last autocommit.
    pub activity: Arc<Activity>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub onboarding_completed: bool,
    pub vault_path: Option<String>,
    pub theme: String,
    pub font: String,
    pub ask_mood: bool,
    pub auto_commit: bool,
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
            ask_mood: s.ask_mood,
            auto_commit: s.auto_commit,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnThisDay {
    pub date: String,
    pub words: usize,
    /// The start of the entry's text, as written.
    pub excerpt: String,
}

impl AppCtx {
    /// Everything lives under the app-data folder `data`, never in the vault.
    pub fn new(settings_path: PathBuf, data: &Path) -> Self {
        let settings = Settings::load(&settings_path);
        AppCtx {
            settings_path,
            index_dir: data.join("index"),
            mood_dir: data.join("mood"),
            history_dir: data.join("history"),
            settings: Mutex::new(settings),
            watcher: Mutex::new(None),
            index: Arc::new(Mutex::new(None)),
            mood: Mutex::new(None),
            history: Arc::new(Mutex::new(None)),
            activity: Arc::new(Activity::default()),
        }
    }

    fn vault(&self) -> Result<PathBuf, String> {
        self.settings
            .lock()
            .map_err(|e| e.to_string())?
            .existing_vault()
            .ok_or_else(|| "no vault configured".to_string())
    }

    pub fn auto_commit(&self) -> bool {
        self.settings.lock().map(|s| s.auto_commit).unwrap_or(false)
    }

    /// Seed the vault's defaults, open its index (brought up to date), its mood state and its
    /// history.
    pub fn open_vault(&self) {
        let vault = self.vault().ok();
        let opened = vault.as_ref().and_then(|v| {
            if let Err(e) = entities::ensure_seeded(v) {
                eprintln!("dhyana: could not seed vault: {e}");
            }
            match VaultIndex::open(v, &self.index_dir) {
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
        if let Ok(mut slot) = self.mood.lock() {
            *slot = vault.as_ref().map(|v| MoodStore::open(&self.mood_dir, &vault_id(v)));
        }
        let history = vault.as_ref().and_then(|v| match History::open(v, &self.history_dir) {
            Ok(h) => Some(h),
            Err(e) => {
                eprintln!("dhyana: could not open history: {e}");
                None
            }
        });
        if let Ok(mut slot) = self.history.lock() {
            // Record the outgoing vault's last changes before switching.
            if let Some(old) = slot.as_mut() {
                if self.auto_commit() {
                    let _ = old.autocommit(chrono::Local::now().date_naive());
                }
            }
            *slot = history;
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

    fn with_mood<T>(&self, f: impl FnOnce(&mut MoodStore) -> Result<T, String>) -> Result<T, String> {
        let mut slot = self.mood.lock().map_err(|e| e.to_string())?;
        f(slot.as_mut().ok_or_else(|| "no vault configured".to_string())?)
    }

    fn with_history<T>(&self, f: impl FnOnce(&mut History) -> Result<T, String>) -> Result<T, String> {
        let mut slot = self.history.lock().map_err(|e| e.to_string())?;
        f(slot.as_mut().ok_or_else(|| "version history is not available".to_string())?)
    }

    /// Re-read one file into the index now, rather than when the watcher gets to it.
    fn refresh(&self, abs: &Path) {
        if let Ok(mut slot) = self.index.lock() {
            if let Some(open) = slot.as_mut() {
                let _ = open.refresh_paths([&abs.to_path_buf()]);
            }
        }
    }

    /// Commit the vault if anything changed (idle and quit). Respects the setting.
    pub fn autocommit(&self) {
        if !self.auto_commit() {
            return;
        }
        if let Ok(mut slot) = self.history.lock() {
            if let Some(h) = slot.as_mut() {
                if let Err(e) = h.autocommit(chrono::Local::now().date_naive()) {
                    eprintln!("dhyana: autocommit failed: {e}");
                }
            }
        }
    }

    /// (Re)start the watcher for the saved vault, if any.
    pub fn restart_watcher(&self, app: &AppHandle) {
        let vault = self.vault().ok();
        let shared = self.index.clone();
        let activity = self.activity.clone();
        let new = vault.and_then(|v| match watcher::start(app.clone(), v, shared, activity) {
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

    /// The day file plus any check-ins still waiting for it.
    fn day(&self, date: &str) -> Result<DayFile, String> {
        let mut day = vault::read_day(&self.vault()?, date).map_err(|e| e.to_string())?;
        day.pending_mood = self.with_mood(|m| Ok(m.pending(date)))?;
        Ok(day)
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
    ctx.open_vault();
    ctx.restart_watcher(&app);
    Ok(state)
}

#[tauri::command]
pub fn read_day(ctx: State<AppCtx>, date: String) -> Result<DayFile, String> {
    ctx.day(&date)
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
    let pending = ctx.with_mood(|m| Ok(m.pending(&date)))?;
    let res = vault::save_day_with(
        &vault_dir,
        &date,
        &body,
        expected_hash.as_deref(),
        force,
        &vault::now_string(),
        &pending,
    )
    .map_err(|e| e.to_string())?;
    if res.status == SaveStatus::Saved {
        // The check-ins are in the file now.
        if !pending.is_empty() {
            ctx.with_mood(|m| m.set_pending(&date, Vec::new()).map_err(|e| e.to_string()))?;
        }
        // Backlinks and upcoming dates reflect this save immediately, not after the watcher fires.
        ctx.refresh(&vault::day_path(&vault_dir, vault::validate_date(&date).map_err(|e| e.to_string())?));
    }
    Ok(res)
}

enum MoodChange {
    Add(CheckIn),
    Update(usize, CheckIn),
    Delete(usize),
}

/// Apply a check-in change. With a day file it goes into the file's frontmatter (after any
/// pending check-ins, which are written first); without one it stays pending in app data, since
/// a check-in alone never creates the day file. `index` counts file check-ins, then pending ones.
fn change_mood(ctx: &AppCtx, date: &str, change: MoodChange) -> Result<DayFile, String> {
    let vault_dir = ctx.vault()?;
    let path = vault::day_path(&vault_dir, vault::validate_date(date).map_err(|e| e.to_string())?);
    let change = match change {
        MoodChange::Add(c) => MoodChange::Add(c.normalized().map_err(|e| e.to_string())?),
        MoodChange::Update(i, c) => MoodChange::Update(i, c.normalized().map_err(|e| e.to_string())?),
        d => d,
    };
    let op = |change: MoodChange| match change {
        MoodChange::Add(c) => mood::Op::Push(c),
        MoodChange::Update(i, c) => mood::Op::Update(i, c),
        MoodChange::Delete(i) => mood::Op::Delete(i),
    };
    ctx.with_mood(|store| {
        let pending = store.pending(date);
        let now = vault::now_string();
        if path.is_file() {
            if !pending.is_empty() {
                vault::edit_day_mood_at(&vault_dir, date, mood::Op::Merge(&pending), &now).map_err(|e| e.to_string())?;
                store.set_pending(date, Vec::new()).map_err(|e| e.to_string())?;
            }
            vault::edit_day_mood_at(&vault_dir, date, op(change), &now).map_err(|e| e.to_string())?;
        } else {
            let mut list = pending;
            mood::apply(&mut list, op(change)).map_err(|e| e.to_string())?;
            store.set_pending(date, list).map_err(|e| e.to_string())?;
        }
        Ok(())
    })?;
    ctx.refresh(&path);
    ctx.day(date)
}

#[tauri::command]
pub fn add_mood(ctx: State<AppCtx>, date: String, checkin: CheckIn) -> Result<DayFile, String> {
    change_mood(&ctx, &date, MoodChange::Add(checkin))
}

#[tauri::command]
pub fn update_mood(ctx: State<AppCtx>, date: String, index: usize, checkin: CheckIn) -> Result<DayFile, String> {
    change_mood(&ctx, &date, MoodChange::Update(index, checkin))
}

#[tauri::command]
pub fn delete_mood(ctx: State<AppCtx>, date: String, index: usize) -> Result<DayFile, String> {
    change_mood(&ctx, &date, MoodChange::Delete(index))
}

/// Should the check-in be offered for this day? Only if the setting is on, the day has no
/// check-in yet, and it hasn't been offered on this device already. (The UI asks only for today.)
#[tauri::command]
pub fn mood_offer(ctx: State<AppCtx>, date: String) -> Result<bool, String> {
    if !ctx.settings.lock().map_err(|e| e.to_string())?.ask_mood {
        return Ok(false);
    }
    let day = ctx.day(&date)?;
    if !day.mood.is_empty() || !day.pending_mood.is_empty() {
        return Ok(false);
    }
    ctx.with_mood(|m| Ok(m.offered(&date).is_none()))
}

/// Record that the check-in was shown, answered or skipped for `date`, so it isn't offered again.
#[tauri::command]
pub fn mark_mood_offered(ctx: State<AppCtx>, date: String, outcome: String) -> Result<(), String> {
    vault::validate_date(&date).map_err(|e| e.to_string())?;
    if !matches!(outcome.as_str(), "shown" | "answered" | "skipped") {
        return Err(format!("unknown outcome: {outcome}"));
    }
    ctx.with_mood(|m| m.mark_offered(&date, &outcome).map_err(|e| e.to_string()))
}

/// Words and check-ins per journal day from `from` to `to` (inclusive).
#[tauri::command]
pub fn day_stats(ctx: State<AppCtx>, from: String, to: String) -> Result<Vec<DayStat>, String> {
    vault::validate_date(&from).map_err(|e| e.to_string())?;
    vault::validate_date(&to).map_err(|e| e.to_string())?;
    ctx.with_index(|_, idx| idx.day_stats(&from, &to).map_err(|e| e.to_string()))
}

const EXCERPT_CHARS: usize = 280;

/// Entries from earlier years on this month and day, newest first.
#[tauri::command]
pub fn on_this_day(ctx: State<AppCtx>, date: String) -> Result<Vec<OnThisDay>, String> {
    vault::validate_date(&date).map_err(|e| e.to_string())?;
    ctx.with_index(|v, idx| {
        let rows = idx.same_day_earlier(&date, 20).map_err(|e| e.to_string())?;
        Ok(rows
            .into_iter()
            .map(|(path, date, words)| {
                let text = std::fs::read_to_string(v.join(&path)).unwrap_or_default();
                let body = frontmatter::split(&text).body;
                let excerpt: String = body
                    .lines()
                    .map(str::trim)
                    .filter(|l| !l.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ")
                    .chars()
                    .take(EXCERPT_CHARS)
                    .collect();
                OnThisDay { date, words, excerpt }
            })
            .collect())
    })
}

/// Versions of one note (vault-relative path), newest first.
#[tauri::command]
pub fn note_history(ctx: State<AppCtx>, path: String) -> Result<Vec<Version>, String> {
    ctx.with_history(|h| h.versions(&path, 200).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn note_version(ctx: State<AppCtx>, path: String, id: String) -> Result<VersionContent, String> {
    ctx.with_history(|h| h.content(&path, &id).map_err(|e| e.to_string()))
}

/// Puts the note back as it was in version `id`; what was there is checkpointed first.
#[tauri::command]
pub fn restore_version(ctx: State<AppCtx>, path: String, id: String) -> Result<(), String> {
    ctx.with_history(|h| h.restore(&path, &id).map_err(|e| e.to_string()))?;
    ctx.refresh(&ctx.vault()?.join(&path));
    Ok(())
}

/// Record a version of the whole vault now, under `reason`. Resolves to its id.
#[tauri::command]
pub fn checkpoint(ctx: State<AppCtx>, reason: String) -> Result<Option<String>, String> {
    let reason = reason.trim();
    let reason = if reason.is_empty() { "Checkpoint" } else { reason };
    ctx.with_history(|h| {
        h.checkpoint(reason)
            .map(|o| o.map(|id| id.to_string()))
            .map_err(|e| e.to_string())
    })
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
        ctx.refresh(&vault::day_path(&vault_dir, vault::validate_date(&date).map_err(|e| e.to_string())?));
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
    let old = ctx.with_index(|_, idx| idx.summary(&path).map_err(|e| e.to_string()))?;
    let res = ctx.with_index(|v, idx| entities::rename(v, idx, &path, &new_name).map_err(|e| e.to_string()))?;
    // Check-ins still waiting for their day file name emotions too.
    if let Some(old) = old.filter(|o| o.kind == Kind::Emotion.as_str()) {
        ctx.with_mood(|m| {
            m.rename_emotion(&names::key(&old.name), &res.entity.name)
                .map_err(|e| e.to_string())
        })?;
    }
    Ok(res)
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
