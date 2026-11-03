pub mod ai;
mod ai_commands;
pub mod commands;
pub mod entities;
pub mod frontmatter;
pub mod history;
pub mod index;
pub mod links;
pub mod mood;
pub mod names;
pub mod search;
pub mod settings;
pub mod vault;
pub mod watcher;
pub mod yaml;

use std::time::Duration;

use tauri::{Emitter, Manager};

/// A version is recorded once the files have been quiet for this long...
const AUTOCOMMIT_QUIET: Duration = Duration::from_secs(20);
/// ...or, while someone keeps writing without a pause, once their first unrecorded change is
/// this old.
const AUTOCOMMIT_MAX: Duration = Duration::from_secs(300);
/// Told to the UI whenever a version is recorded, so an open history list can add it.
const HISTORY_EVENT: &str = "history://changed";

/// `dhyana --mcp`: serve the journal tools to an MCP client over stdio, no window.
pub fn run_mcp() {
    ai::mcp::run_stdio();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let ctx = commands::AppCtx::new(dir.join("settings.json"), &dir);
            ctx.open_vault();
            ctx.restart_watcher(app.handle());
            app.manage(ctx);

            // Autocommit: the watcher marks activity, this records a version when it is due.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(5));
                let ctx = handle.state::<commands::AppCtx>();
                if ctx.activity.take_if_due(AUTOCOMMIT_QUIET, AUTOCOMMIT_MAX) && ctx.autocommit() {
                    let _ = handle.emit(HISTORY_EVENT, ());
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_state,
            commands::update_settings,
            commands::default_vault_path,
            commands::set_vault,
            commands::read_day,
            commands::save_day,
            commands::list_days,
            commands::list_years,
            commands::delete_day,
            commands::set_private,
            commands::add_mood,
            commands::update_mood,
            commands::delete_mood,
            commands::mood_offer,
            commands::mark_mood_offered,
            commands::day_stats,
            commands::on_this_day,
            commands::note_history,
            commands::note_version,
            commands::restore_version,
            commands::checkpoint,
            commands::list_entities,
            commands::list_tags,
            commands::get_entity,
            commands::create_entity,
            commands::update_entity,
            commands::rename_entity,
            commands::delete_entity,
            commands::reset_library,
            commands::tag_notes,
            commands::upcoming,
            commands::rebuild_index,
            commands::search,
            commands::analytics_days,
            commands::saved_searches,
            commands::save_saved_searches,
            commands::sample_root,
            commands::remove_sample,
            ai_commands::ai_get_settings,
            ai_commands::ai_update_settings,
            ai_commands::ai_consent,
            ai_commands::ai_set_key,
            ai_commands::ai_clear_key,
            ai_commands::ai_detect_agents,
            ai_commands::ai_preview,
            ai_commands::ai_send,
            ai_commands::ai_cancel,
            ai_commands::ai_usage,
            ai_commands::ai_log,
            ai_commands::ai_clear_log,
            ai_commands::ai_mcp_info,
            ai_commands::ai_list_sessions,
            ai_commands::ai_load_session,
            ai_commands::ai_save_session,
            ai_commands::ai_delete_session,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // The window flushes unsaved text before it closes; this records it on the way out.
            if let tauri::RunEvent::Exit = event {
                app.state::<commands::AppCtx>().autocommit();
            }
        });
}
