// 知墨 - Tauri 库入口
// 负责：
// - 初始化 Tauri 应用
// - 注册插件（SQL/FS/Dialog/OS/Path）
// - 注册自定义命令（加密存储等）
// - 配置数据库迁移

mod db;
mod secret;
mod source_parser;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:main.sqlite", db::migrations())
                .build(),
        )
        .setup(|app| {
            // 应用启动时初始化
            let app_handle = app.handle();

            // 初始化加密密钥（用于 API Key 加密）
            secret::init_secret_store(app_handle)?;

            // 初始化本地数据目录结构
            app_handle.manage(app_state::AppState::new(app_handle)?);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            secret::encrypt_secret,
            secret::decrypt_secret,
            secret::get_or_create_app_key,
            source_parser::parse_source_file,
            source_parser::parse_document_structured,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}

/// 应用全局状态
mod app_state {
    use std::path::PathBuf;
    use tauri::{AppHandle, Manager};

    pub struct AppState {
        #[allow(dead_code)]
        pub app_data_dir: PathBuf,
    }

    impl AppState {
        pub fn new(app: &AppHandle) -> Result<Self, String> {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("获取 AppData 目录失败: {}", e))?;
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| format!("创建 AppData 目录失败: {}", e))?;
            Ok(Self { app_data_dir })
        }
    }
}
