// Piano on Windows: the same files as the web app (tools/build-www.js), in
// the system's own WebView (WebView2). Everything the app does lives in
// src/; this opens the window, keeps one copy running, and lets the page
// reach the piano over MIDI without asking each time.
// keel's platform.js finds it through window.__TAURI__ (withGlobalTauri).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        // First, so a second launch brings the running window back instead
        // of opening another copy beside it.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        // Links to other sites open in the browser (keel's platform.js).
        .plugin(tauri_plugin_opener::init())
        // Web MIDI asks for permission; reaching the piano is the app's whole
        // job, so it's granted. Every other request gets the WebView's own answer.
        .on_permission_request(|_, kind| match kind {
            PermissionKind::Midi => PermissionResponse::Allow,
            _ => PermissionResponse::Default,
        })
        .run(tauri::generate_context!())
        .expect("Piano failed to start");
}
