mod commands;
mod frontmatter;
mod settings;
mod vault;
mod watcher;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let ctx = commands::AppCtx::new(dir.join("settings.json"));
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
