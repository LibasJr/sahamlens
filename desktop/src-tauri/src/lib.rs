use sha2::{Digest, Sha256};

fn stronghold_key(password: &[u8]) -> Vec<u8> {
    Sha256::digest(password).to_vec()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| stronghold_key(password.as_ref()))
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running SahamLens desktop");
}

#[cfg(test)]
mod tests {
    use super::stronghold_key;

    #[test]
    fn stronghold_key_is_always_exactly_32_bytes() {
        assert_eq!(stronghold_key(b"short").len(), 32);
        assert_eq!(stronghold_key(&[7; 64]).len(), 32);
        assert_ne!(stronghold_key(b"password-a"), stronghold_key(b"password-b"));
    }
}
