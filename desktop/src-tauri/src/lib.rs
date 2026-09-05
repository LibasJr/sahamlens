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
    headers: HashMap<String, String>,
}

fn resolve_api_url(endpoint: &str) -> Result<reqwest::Url, String> {
    let url = if endpoint.starts_with("http") {
        reqwest::Url::parse(endpoint).map_err(|_| "Endpoint API tidak valid".to_string())?
    } else {
        reqwest::Url::parse(&format!("https://sahamlens.id{endpoint}"))
            .map_err(|_| "Endpoint API tidak valid".to_string())?
    };

    if url.scheme() != "https"
        || url.host_str() != Some("sahamlens.id")
        || !url.path().starts_with("/api/")
    {
        return Err("Endpoint di luar API SahamLens ditolak".to_string());
    }

    Ok(url)
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

    let url = resolve_api_url(&endpoint)?;

    let mut req = match method.to_uppercase().as_str() {
        "POST" => client.post(url),
        "DELETE" => client.delete(url),
        "PUT" => client.put(url),
        "PATCH" => client.patch(url),
        _ => client.get(url),
    };

    if let Some(tok) = token {
        if !tok.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", tok));
        }
    }

    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            if matches!(
                k.to_ascii_lowercase().as_str(),
                "authorization" | "cookie" | "host" | "origin" | "referer" | "content-length"
            ) {
                continue;
            }
            req = req.header(&k, &v);
        }
    }

    req = req
        .header("Origin", "https://sahamlens.id")
        .header("Referer", "https://sahamlens.id/");

    if let Some(b) = body {
        req = req.body(b);
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

#[cfg(test)]
mod tests {
    use super::resolve_api_url;

    #[test]
    fn accepts_only_sahamlens_https_api_routes() {
        assert_eq!(
            resolve_api_url("/api/market-data?limit=5")
                .expect("relative API URL")
                .as_str(),
            "https://sahamlens.id/api/market-data?limit=5"
        );
        assert!(resolve_api_url("https://sahamlens.id/api/auth/me").is_ok());
        assert!(resolve_api_url("http://sahamlens.id/api/auth/me").is_err());
        assert!(resolve_api_url("https://example.com/api/auth/me").is_err());
        assert!(resolve_api_url("https://sahamlens.id/login").is_err());
    }
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
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            native_api_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
