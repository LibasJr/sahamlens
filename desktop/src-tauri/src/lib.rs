mod api_policy;
mod credentials;

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

fn api_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Gagal menyiapkan koneksi API".to_string())
}

async fn execute_native_request(
    client: &reqwest::Client,
    endpoint: String,
    method: String,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
    token: Option<&str>,
) -> Result<NativeResponse, String> {
    let validated = api_policy::validate_request(&endpoint, &method, body, headers)?;
    let mut request = client.request(validated.method, validated.url);

    if let Some(token) = token.filter(|token| !token.is_empty()) {
        request = request.header("Authorization", format!("Bearer {token}"));
    }
    for (name, value) in validated.headers {
        request = request.header(name, value);
    }
    request = request
        .header("Origin", "https://sahamlens.id")
        .header("Referer", "https://sahamlens.id/");
    if let Some(body) = validated.body {
        request = request.body(body);
    }

    let response = request
        .send()
        .await
        .map_err(|_| "Request API gagal".to_string())?;
    let status = response.status().as_u16();
    let ok = response.status().is_success();
    let response_headers = ["content-type", "retry-after", "x-request-id"]
        .into_iter()
        .filter_map(|name| {
            response
                .headers()
                .get(name)
                .and_then(|value| value.to_str().ok())
                .map(|value| (name.to_string(), value.to_string()))
        })
        .collect();
    let body = response
        .text()
        .await
        .map_err(|_| "Respons API tidak valid".to_string())?;

    Ok(NativeResponse {
        status,
        body,
        ok,
        headers: response_headers,
    })
}

#[tauri::command]
async fn native_api_request(
    app: tauri::AppHandle,
    endpoint: String,
    method: String,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
) -> Result<NativeResponse, String> {
    let token = credentials::load_token(&app)?;
    let response = execute_native_request(
        &api_client()?,
        endpoint,
        method,
        body,
        headers,
        token.as_deref(),
    )
    .await?;

    if response.status == 401 {
        credentials::delete_token(&app)?;
    }
    Ok(response)
}

#[tauri::command]
async fn native_login(
    app: tauri::AppHandle,
    body: String,
    headers: Option<HashMap<String, String>>,
) -> Result<NativeResponse, String> {
    let mut response = execute_native_request(
        &api_client()?,
        "/api/auth/desktop/login".to_string(),
        "POST".to_string(),
        Some(body),
        headers,
        None,
    )
    .await?;

    if response.ok {
        let (token, sanitized_body) = credentials::extract_login_token(&response.body)?;
        credentials::save_token(&app, &token)?;
        response.body = sanitized_body;
    }
    Ok(response)
}

#[tauri::command]
async fn native_logout(
    app: tauri::AppHandle,
    headers: Option<HashMap<String, String>>,
) -> Result<NativeResponse, String> {
    let token = credentials::load_token(&app)?;
    let response = execute_native_request(
        &api_client()?,
        "/api/auth/desktop/logout".to_string(),
        "POST".to_string(),
        None,
        headers,
        token.as_deref(),
    )
    .await;
    credentials::delete_token(&app)?;
    response
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_keyring_store::init())
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
            native_api_request,
            native_login,
            native_logout
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
