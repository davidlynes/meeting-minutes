//! Secure JWT token storage using Tauri's store plugin.
//!
//! Tokens are persisted in `auth.json` in the app data directory,
//! separate from analytics data. The frontend calls these commands
//! to save/retrieve/clear tokens after login/logout.

use tauri::{AppHandle, Manager, Runtime};

const STORE_FILE: &str = "auth.json";

/// Read a string value from the auth store.
fn read_store_value<R: Runtime>(app: &AppHandle<R>, key: &str) -> Option<String> {
    let data_dir = app.path().app_data_dir().ok()?;
    let store_path = data_dir.join(STORE_FILE);
    let contents = std::fs::read_to_string(&store_path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&contents).ok()?;
    parsed.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

/// Write a key-value pair to the auth store (merging with existing data).
fn write_store_value<R: Runtime>(app: &AppHandle<R>, key: &str, value: &str) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let store_path = data_dir.join(STORE_FILE);

    // Read existing data or start with empty object
    let mut data: serde_json::Value = if store_path.exists() {
        let contents =
            std::fs::read_to_string(&store_path).map_err(|e| format!("Read error: {}", e))?;
        serde_json::from_str(&contents).unwrap_or(serde_json::json!({}))
    } else {
        // Ensure directory exists
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create dir: {}", e))?;
        serde_json::json!({})
    };

    data[key] = serde_json::Value::String(value.to_string());

    let json_str =
        serde_json::to_string_pretty(&data).map_err(|e| format!("Serialize error: {}", e))?;

    // Atomic write: temp file then rename
    let temp_path = store_path.with_extension("json.tmp");
    std::fs::write(&temp_path, &json_str).map_err(|e| format!("Write error: {}", e))?;
    std::fs::rename(&temp_path, &store_path).map_err(|e| format!("Rename error: {}", e))?;

    Ok(())
}

/// Clear the entire auth store (logout).
fn clear_store<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let store_path = data_dir.join(STORE_FILE);
    if store_path.exists() {
        std::fs::remove_file(&store_path).map_err(|e| format!("Delete error: {}", e))?;
    }
    Ok(())
}

// ── Tauri Commands ──────────────────────────────────────────────────

#[tauri::command]
pub fn auth_save_tokens<R: Runtime>(
    app: AppHandle<R>,
    access_token: String,
    refresh_token: String,
) -> Result<(), String> {
    write_store_value(&app, "access_token", &access_token)?;
    write_store_value(&app, "refresh_token", &refresh_token)?;
    log::info!("Auth tokens saved to secure store");
    Ok(())
}

#[tauri::command]
pub fn auth_get_access_token<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    Ok(read_store_value(&app, "access_token"))
}

#[tauri::command]
pub fn auth_get_refresh_token<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    Ok(read_store_value(&app, "refresh_token"))
}

#[tauri::command]
pub fn auth_clear_tokens<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    clear_store(&app)?;
    log::info!("Auth tokens cleared from secure store");
    Ok(())
}

/// Save the authenticated user's ID for device registry linking.
#[tauri::command]
pub fn auth_save_user_id<R: Runtime>(app: AppHandle<R>, user_id: String) -> Result<(), String> {
    write_store_value(&app, "auth_user_id", &user_id)
}

/// Get the authenticated user's ID (if logged in).
#[tauri::command]
pub fn auth_get_user_id<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    Ok(read_store_value(&app, "auth_user_id"))
}
