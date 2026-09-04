use std::collections::HashMap;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[tauri::command]
fn get_platform_info() -> String {
    format!("SahamLens Pro Native ({})", std::env::consts::OS)
}

#[derive(serde::Serialize)]
struct NativeResponse {
    status: u16,
    body: String,
    ok: bool,
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
        .build()
        .map_err(|e| e.to_string())?;

    let url = if endpoint.starts_with("http") {
        endpoint
    } else {
        format!("https://sahamlens.id{}", endpoint)
    };

    let mut req = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };

    if let Some(tok) = token {
        if !tok.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", tok));
        }
    }

    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            req = req.header(&k, &v);
        }
    }

    if let Some(b) = body {
        req = req.header("Content-Type", "application/json").body(b);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let ok = resp.status().is_success();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    Ok(NativeResponse {
        status,
        body: text,
        ok,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Build Tray Menu
            let show_i = MenuItem::with_id(app, "show", "Buka SahamLens Pro", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("SahamLens Pro Terminal")
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
        .invoke_handler(tauri::generate_handler![get_platform_info, native_api_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
