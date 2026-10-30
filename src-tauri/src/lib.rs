mod commands;
mod entities;
mod frontmatter;
mod history;
mod index;
mod links;
mod mood;
mod names;
mod settings;
mod vault;
mod watcher;
mod yaml;

use std::time::Duration;

use tauri::Manager;

/// History waits for this much quiet after the last file change before it commits.
const AUTOCOMMIT_IDLE: Duration = Duration::from_secs(90);

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

            // Autocommit on idle: the watcher marks activity, this commits once things go quiet.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(10));
                let ctx = handle.state::<commands::AppCtx>();
                if ctx.activity.take_if_idle(AUTOCOMMIT_IDLE) {
                    ctx.autocommit();
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
