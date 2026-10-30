mod commands;
mod entities;
mod frontmatter;
mod index;
mod links;
mod names;
mod settings;
mod vault;
mod watcher;
mod yaml;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let ctx = commands::AppCtx::new(dir.join("settings.json"), dir.join("index"));
            ctx.open_index();
            ctx.restart_watcher(app.handle());
            app.manage(ctx);
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
            commands::delete_day,
            commands::list_entities,
            commands::list_tags,
            commands::get_entity,
            commands::create_entity,
            commands::update_entity,
            commands::rename_entity,
            commands::upcoming,
            commands::rebuild_index,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
