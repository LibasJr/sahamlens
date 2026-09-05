use tauri::Runtime;
use tauri_plugin_keyring_store::KeyringExt;

const TOKEN_ACCOUNT: &str = "auth.bearer-token";

pub(crate) fn save_token<R: Runtime>(app: &tauri::AppHandle<R>, token: &str) -> Result<(), String> {
    if token.is_empty() {
        return Err("Token autentikasi kosong".to_string());
    }
    app.keyring()
        .store
        .set_password(TOKEN_ACCOUNT, token)
        .map_err(|_| "Credential vault tidak tersedia".to_string())
}

pub(crate) fn load_token<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<Option<String>, String> {
    app.keyring()
        .store
        .get_password(TOKEN_ACCOUNT)
        .map_err(|_| "Credential vault tidak tersedia".to_string())
}

pub(crate) fn delete_token<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    app.keyring()
        .store
        .delete(TOKEN_ACCOUNT)
        .map_err(|_| "Credential vault tidak tersedia".to_string())
}

pub(crate) fn extract_login_token(body: &str) -> Result<(String, String), String> {
    let mut payload: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Respons login tidak valid".to_string())?;
    let token = payload
        .get("token")
        .and_then(serde_json::Value::as_str)
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "Respons login tidak memiliki token".to_string())?
        .to_string();
    payload
        .as_object_mut()
        .ok_or_else(|| "Respons login tidak valid".to_string())?
        .remove("token");
    let sanitized = serde_json::to_string(&payload)
        .map_err(|_| "Respons login tidak dapat diproses".to_string())?;
    Ok((token, sanitized))
}

#[cfg(test)]
mod tests {
    use super::extract_login_token;

    #[test]
    fn extracts_token_and_removes_it_from_renderer_response() {
        let (token, sanitized) = extract_login_token(
            r#"{"success":true,"token":"secret-token","email":"user@example.com","role":"user"}"#,
        )
        .unwrap();

        assert_eq!(token, "secret-token");
        assert!(!sanitized.contains("secret-token"));
        assert!(!sanitized.contains("\"token\""));
        assert!(sanitized.contains("user@example.com"));
    }

    #[test]
    fn rejects_missing_or_empty_tokens() {
        assert!(extract_login_token(r#"{"success":true}"#).is_err());
        assert!(extract_login_token(r#"{"success":true,"token":""}"#).is_err());
        assert!(extract_login_token("not-json").is_err());
    }
}
