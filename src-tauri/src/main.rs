// 知墨 - Tauri 后端入口
// 防止 Windows Debug 模式下出现控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ai_writing_client_lib::run()
}
