mod api_policy;
mod credentials;
mod diagnostics;
mod export;
mod navigation;

use std::collections::HashMap;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

const MAX_RESPONSE_BYTES: usize = 5 * 1024 * 1024;

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

    let mut response = request
        .send()
        .await
        .map_err(|_| "Request API gagal".to_string())?;
    let status = response.status().as_u16();
    let ok = response.status().is_success();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err("Respons API melebihi batas 5 MB".to_string());
    }
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
    let mut response_bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Respons API tidak valid".to_string())?
    {
        if response_bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err("Respons API melebihi batas 5 MB".to_string());
        }
        response_bytes.extend_from_slice(&chunk);
    }
    let body =
        String::from_utf8(response_bytes).map_err(|_| "Respons API tidak valid".to_string())?;

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

#[tauri::command]
fn native_open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let validated = navigation::validate_external_url(&url)?;
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(validated.as_str(), None::<&str>)
        .map_err(|_| "Tautan eksternal tidak dapat dibuka".to_string())
}

#[tauri::command]
fn native_resolve_deep_link(url: String) -> Result<String, String> {
    Ok(navigation::deep_link_route(&navigation::parse_deep_link(
        &url,
    )?))
}

#[tauri::command]
fn native_save_text_export(
    app: tauri::AppHandle,
    filename: String,
    contents: String,
) -> Result<bool, String> {
    export::save_export(&app, &filename, contents.as_bytes())
}

#[tauri::command]
fn native_save_binary_export(
    app: tauri::AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    export::save_export(&app, &filename, &bytes)
}

#[tauri::command]
fn native_build_diagnostic(input: diagnostics::DiagnosticInput) -> diagnostics::DiagnosticEnvelope {
    diagnostics::build_diagnostic_envelope(env!("CARGO_PKG_VERSION"), std::env::consts::OS, input)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
            native_logout,
            native_open_external,
            native_resolve_deep_link,
            native_save_text_export,
            native_save_binary_export,
            native_build_diagnostic
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
