mod api_policy;

use std::collections::HashMap;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[tauri::command]
fn get_platform_info() -> String {
    format!("SahamLens Desktop Native ({})", std::env::consts::OS)
}

#[derive(serde::Serialize)]
struct NativeResponse {
    status: u16,
    body: String,
    ok: bool,
    headers: HashMap<String, String>,
}

#[tauri::command]
async fn native_api_request(
    endpoint: String,
    method: String,
    body: Option<String>,
    token: Option<String>,
    headers: Option<HashMap<String, String>>,
) -> Result<NativeResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Gagal menyiapkan koneksi API".to_string())?;

    let validated = api_policy::validate_request(&endpoint, &method, body, headers)?;
    let mut req = client.request(validated.method, validated.url);

    if let Some(tok) = token {
        if !tok.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", tok));
        }
    }

    for (name, value) in validated.headers {
        req = req.header(name, value);
    }

    req = req
        .header("Origin", "https://sahamlens.id")
        .header("Referer", "https://sahamlens.id/");

    if let Some(body) = validated.body {
        req = req.body(body);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let ok = resp.status().is_success();
    let response_headers = ["content-type", "retry-after", "x-request-id"]
        .into_iter()
        .filter_map(|name| {
            resp.headers()
                .get(name)
                .and_then(|value| value.to_str().ok())
                .map(|value| (name.to_string(), value.to_string()))
        })
        .collect();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    Ok(NativeResponse {
        status,
        body: text,
        ok,
        headers: response_headers,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Build Tray Menu
            let show_i =
                MenuItem::with_id(app, "show", "Buka SahamLens Desktop", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("SahamLens Desktop Terminal")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            native_api_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
