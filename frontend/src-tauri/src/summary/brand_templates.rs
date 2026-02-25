use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::RwLock;
use tracing::{debug, info, warn};

// Global storage for directory paths
static BUNDLED_BRAND_TEMPLATES_DIR: Lazy<RwLock<Option<PathBuf>>> = Lazy::new(|| RwLock::new(None));
static USER_BRAND_TEMPLATES_DIR: Lazy<RwLock<Option<PathBuf>>> = Lazy::new(|| RwLock::new(None));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandTemplate {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo: Option<String>,
    pub fonts: BrandFonts,
    pub colors: BrandColors,
    pub heading_sizes: BrandHeadingSizes,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub header: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrandFonts {
    pub heading: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrandColors {
    pub primary: String,
    pub secondary: String,
    pub heading: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrandHeadingSizes {
    pub h1: u32,
    pub h2: u32,
    pub h3: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrandTemplateInfo {
    pub id: String,
    pub name: String,
    pub is_bundled: bool,
}

/// Set the bundled brand templates directory path (called once at app startup)
pub fn set_bundled_brand_templates_dir(path: PathBuf) {
    info!("Bundled brand templates directory set to: {:?}", path);
    if let Ok(mut dir) = BUNDLED_BRAND_TEMPLATES_DIR.write() {
        *dir = Some(path);
    }
}

/// Set the user brand templates directory path (called once at app startup)
pub fn set_user_brand_templates_dir(path: PathBuf) {
    info!("User brand templates directory set to: {:?}", path);
    if let Ok(mut dir) = USER_BRAND_TEMPLATES_DIR.write() {
        *dir = Some(path);
    }
}

fn get_bundled_dir() -> Option<PathBuf> {
    BUNDLED_BRAND_TEMPLATES_DIR.read().ok()?.clone()
}

fn get_user_dir() -> Option<PathBuf> {
    USER_BRAND_TEMPLATES_DIR.read().ok()?.clone()
}

fn ensure_user_dir() -> Result<PathBuf, String> {
    let dir = get_user_dir().ok_or("User brand templates directory not initialised")?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create user brand templates directory: {}", e))?;
    }
    Ok(dir)
}

/// List all available brand templates (bundled + user)
pub fn list_brand_templates() -> Vec<BrandTemplateInfo> {
    let mut templates = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    // User templates first (they override bundled)
    if let Some(user_dir) = get_user_dir() {
        if user_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&user_dir) {
                for entry in entries.flatten() {
                    if let Some(filename) = entry.file_name().to_str() {
                        if filename.ends_with(".json") {
                            let id = filename.trim_end_matches(".json").to_string();
                            if let Ok(content) = std::fs::read_to_string(entry.path()) {
                                if let Ok(tmpl) = serde_json::from_str::<BrandTemplate>(&content) {
                                    seen_ids.insert(id.clone());
                                    templates.push(BrandTemplateInfo {
                                        id,
                                        name: tmpl.name,
                                        is_bundled: false,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Bundled templates
    if let Some(bundled_dir) = get_bundled_dir() {
        if bundled_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&bundled_dir) {
                for entry in entries.flatten() {
                    if let Some(filename) = entry.file_name().to_str() {
                        if filename.ends_with(".json") {
                            let id = filename.trim_end_matches(".json").to_string();
                            if !seen_ids.contains(&id) {
                                if let Ok(content) = std::fs::read_to_string(entry.path()) {
                                    if let Ok(tmpl) =
                                        serde_json::from_str::<BrandTemplate>(&content)
                                    {
                                        templates.push(BrandTemplateInfo {
                                            id,
                                            name: tmpl.name,
                                            is_bundled: true,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    templates.sort_by(|a, b| a.name.cmp(&b.name));
    templates
}

/// Get a brand template by ID (user dir first, then bundled)
pub fn get_brand_template(id: &str) -> Result<BrandTemplate, String> {
    let filename = format!("{}.json", id);

    // Try user dir first
    if let Some(user_dir) = get_user_dir() {
        let path = user_dir.join(&filename);
        if path.exists() {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read brand template '{}': {}", id, e))?;
            let tmpl: BrandTemplate = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse brand template '{}': {}", id, e))?;
            debug!("Loaded user brand template '{}'", id);
            return Ok(tmpl);
        }
    }

    // Try bundled
    if let Some(bundled_dir) = get_bundled_dir() {
        let path = bundled_dir.join(&filename);
        if path.exists() {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read bundled brand template '{}': {}", id, e))?;
            let tmpl: BrandTemplate = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse bundled brand template '{}': {}", id, e))?;
            debug!("Loaded bundled brand template '{}'", id);
            return Ok(tmpl);
        }
    }

    Err(format!("Brand template '{}' not found", id))
}

/// Get logo bytes for a brand template
pub fn get_brand_template_logo(id: &str) -> Option<Vec<u8>> {
    let tmpl = get_brand_template(id).ok()?;
    let logo_filename = tmpl.logo?;

    // Try user dir first
    if let Some(user_dir) = get_user_dir() {
        let path = user_dir.join(&logo_filename);
        if path.exists() {
            if let Ok(bytes) = std::fs::read(&path) {
                debug!("Loaded user brand template logo for '{}'", id);
                return Some(bytes);
            }
        }
    }

    // Try bundled
    if let Some(bundled_dir) = get_bundled_dir() {
        let path = bundled_dir.join(&logo_filename);
        if path.exists() {
            if let Ok(bytes) = std::fs::read(&path) {
                debug!("Loaded bundled brand template logo for '{}'", id);
                return Some(bytes);
            }
        }
    }

    warn!("Logo file '{}' not found for brand template '{}'", logo_filename, id);
    None
}

/// Save a brand template to the user directory
pub fn save_brand_template(template: &BrandTemplate, logo_bytes: Option<&[u8]>) -> Result<(), String> {
    let user_dir = ensure_user_dir()?;

    // Write JSON
    let json = serde_json::to_string_pretty(template)
        .map_err(|e| format!("Failed to serialise brand template: {}", e))?;
    let json_path = user_dir.join(format!("{}.json", template.id));
    std::fs::write(&json_path, json)
        .map_err(|e| format!("Failed to write brand template '{}': {}", template.id, e))?;

    // Write logo if provided
    if let (Some(bytes), Some(logo_filename)) = (logo_bytes, &template.logo) {
        let logo_path = user_dir.join(logo_filename);
        std::fs::write(&logo_path, bytes)
            .map_err(|e| format!("Failed to write logo for '{}': {}", template.id, e))?;
    }

    info!("Saved brand template '{}' to {:?}", template.id, json_path);
    Ok(())
}

/// Delete a user brand template (cannot delete bundled templates)
pub fn delete_brand_template(id: &str) -> Result<(), String> {
    let user_dir = get_user_dir().ok_or("User brand templates directory not initialised")?;
    let json_path = user_dir.join(format!("{}.json", id));

    if !json_path.exists() {
        return Err(format!("Brand template '{}' not found in user directory (bundled templates cannot be deleted)", id));
    }

    // Read logo filename before deleting JSON
    let logo_filename = std::fs::read_to_string(&json_path)
        .ok()
        .and_then(|content| serde_json::from_str::<BrandTemplate>(&content).ok())
        .and_then(|tmpl| tmpl.logo);

    // Remove the JSON file
    std::fs::remove_file(&json_path)
        .map_err(|e| format!("Failed to delete brand template '{}': {}", id, e))?;

    // Remove associated logo if it exists
    if let Some(logo) = logo_filename {
        let logo_path = user_dir.join(&logo);
        let _ = std::fs::remove_file(logo_path);
    }

    info!("Deleted brand template '{}'", id);
    Ok(())
}

// ── Tauri Commands ──────────────────────────────────────────────────

#[tauri::command]
pub fn api_list_brand_templates() -> Vec<BrandTemplateInfo> {
    list_brand_templates()
}

#[tauri::command]
pub fn api_get_brand_template(id: String) -> Result<BrandTemplate, String> {
    get_brand_template(&id)
}

#[tauri::command]
pub fn api_get_brand_template_logo(id: String) -> Option<Vec<u8>> {
    get_brand_template_logo(&id)
}

#[tauri::command]
pub fn api_save_brand_template(
    template: BrandTemplate,
    logo_bytes: Option<Vec<u8>>,
) -> Result<(), String> {
    save_brand_template(&template, logo_bytes.as_deref())
}

#[tauri::command]
pub fn api_delete_brand_template(id: String) -> Result<(), String> {
    delete_brand_template(&id)
}
