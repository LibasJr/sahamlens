use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;

pub(crate) const MAX_EXPORT_BYTES: usize = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS: [&str; 2] = ["csv", "png"];

pub(crate) fn sanitize_export_filename(candidate: &str) -> Result<String, String> {
    let trimmed = candidate.trim();
    if trimmed.is_empty() || trimmed.len() > 120 || trimmed.contains(['/', '\\', '\0']) {
        return Err("Nama file ekspor tidak valid".to_string());
    }
    let (stem, extension) = trimmed
        .rsplit_once('.')
        .ok_or_else(|| "Ekstensi file ekspor tidak valid".to_string())?;
    if stem.is_empty()
        || !ALLOWED_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        || !stem
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err("Nama file ekspor tidak valid".to_string());
    }
    Ok(trimmed.to_string())
}

fn select_export_path(
    app: &tauri::AppHandle,
    filename: String,
    extension: &str,
) -> Result<Option<PathBuf>, String> {
    app.dialog()
        .file()
        .set_file_name(filename)
        .add_filter(extension.to_ascii_uppercase(), &[extension])
        .blocking_save_file()
        .map(|selected| {
            selected
                .into_path()
                .map_err(|_| "Lokasi ekspor bukan path lokal".to_string())
        })
        .transpose()
}

pub(crate) fn save_export(
    app: &tauri::AppHandle,
    filename: &str,
    bytes: &[u8],
) -> Result<bool, String> {
    let filename = sanitize_export_filename(filename)?;
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err("Ukuran ekspor melebihi batas 5 MB".to_string());
    }
    let extension = filename
        .rsplit_once('.')
        .expect("validated extension")
        .1
        .to_ascii_lowercase();
    let Some(path) = select_export_path(app, filename, &extension)? else {
        return Ok(false);
    };
    std::fs::write(path, bytes).map_err(|_| "File ekspor tidak dapat ditulis".to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::{sanitize_export_filename, MAX_EXPORT_BYTES};

    #[test]
    fn accepts_only_bounded_export_leaf_names() {
        for name in ["SahamLens-BBCA.csv", "SahamLens-BBCA.png"] {
            assert_eq!(sanitize_export_filename(name).unwrap(), name);
        }
        for name in [
            "",
            "../secret.csv",
            "folder/out.csv",
            "out.exe",
            ".csv",
            "out.csv.exe",
        ] {
            assert!(sanitize_export_filename(name).is_err(), "accepted {name}");
        }
        assert_eq!(MAX_EXPORT_BYTES, 5 * 1024 * 1024);
    }
}
