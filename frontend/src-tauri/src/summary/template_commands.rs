use crate::summary::templates;
use serde::{Deserialize, Serialize};
use tauri::Runtime;
use tracing::{error, info, warn};

/// Template metadata for UI display
#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateInfo {
    /// Template identifier (e.g., "daily_standup", "standard_meeting")
    pub id: String,

    /// Display name for the template
    pub name: String,

    /// Brief description of the template's purpose
    pub description: String,
}

/// Detailed template structure for preview/debugging
#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateDetails {
    /// Template identifier
    pub id: String,

    /// Display name
    pub name: String,

    /// Description
    pub description: String,

    /// List of section titles in order
    pub sections: Vec<String>,
}

/// Lists all available templates
///
/// Returns templates from both built-in (embedded) and custom (user data directory) sources.
/// Templates are automatically discovered - no code changes needed to add new templates.
///
/// # Returns
/// Vector of TemplateInfo with id, name, and description for each template
#[tauri::command]
pub async fn api_list_templates<R: Runtime>(
    _app: tauri::AppHandle<R>,
) -> Result<Vec<TemplateInfo>, String> {
    info!("api_list_templates called");

    let templates = templates::list_templates();

    let template_infos: Vec<TemplateInfo> = templates
        .into_iter()
        .map(|(id, name, description)| TemplateInfo {
            id,
            name,
            description,
        })
        .collect();

    info!("Found {} available templates", template_infos.len());

    Ok(template_infos)
}

/// Gets detailed information about a specific template
///
/// # Arguments
/// * `template_id` - Template identifier (e.g., "daily_standup")
///
/// # Returns
/// TemplateDetails with full template structure
#[tauri::command]
pub async fn api_get_template_details<R: Runtime>(
    _app: tauri::AppHandle<R>,
    template_id: String,
) -> Result<TemplateDetails, String> {
    info!("api_get_template_details called for template_id: {}", template_id);

    let template = templates::get_template(&template_id)?;

    let section_titles: Vec<String> = template
        .sections
        .iter()
        .map(|section| section.title.clone())
        .collect();

    let details = TemplateDetails {
        id: template_id,
        name: template.name,
        description: template.description,
        sections: section_titles,
    };

    info!("Retrieved template details for '{}'", details.name);

    Ok(details)
}

/// Validates a custom template JSON string
///
/// Useful for template editor UI or validation before saving custom templates
///
/// # Arguments
/// * `template_json` - Raw JSON string of the template
///
/// # Returns
/// Ok(template_name) if valid, Err(error_message) if invalid
#[tauri::command]
pub async fn api_validate_template<R: Runtime>(
    _app: tauri::AppHandle<R>,
    template_json: String,
) -> Result<String, String> {
    info!("api_validate_template called");

    match templates::validate_and_parse_template(&template_json) {
        Ok(template) => {
            info!("Template '{}' validated successfully", template.name);
            Ok(template.name)
        }
        Err(e) => {
            warn!("Template validation failed: {}", e);
            Err(e)
        }
    }
}

/// Result of a template sync operation
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncResult {
    pub synced_count: u32,
    pub failed_count: u32,
    pub is_online: bool,
}

/// Sync response shape from backend API
#[derive(Debug, Deserialize)]
struct BackendSyncResponse {
    templates: Vec<BackendTemplate>,
}

#[derive(Debug, Deserialize)]
struct BackendTemplate {
    template_id: String,
    name: String,
    description: String,
    sections: Vec<serde_json::Value>,
    #[serde(default)]
    global_instruction: Option<String>,
    #[serde(default)]
    clinical_safety_rules: Option<Vec<String>>,
    #[serde(default)]
    version: Option<u32>,
    #[serde(default)]
    updated_at: Option<String>,
}

/// Internal sync function (called from Tauri command and startup)
pub async fn sync_templates_internal() -> SyncResult {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build();

    let client = match client {
        Ok(c) => c,
        Err(e) => {
            warn!("Failed to create HTTP client for template sync: {}", e);
            return SyncResult { synced_count: 0, failed_count: 0, is_online: false };
        }
    };

    let response = client
        .get("http://localhost:5167/api/templates?client_id=default")
        .send()
        .await;

    let response = match response {
        Ok(r) => r,
        Err(e) => {
            info!("Template sync: backend not reachable ({}), using cached/bundled templates", e);
            return SyncResult { synced_count: 0, failed_count: 0, is_online: false };
        }
    };

    if !response.status().is_success() {
        warn!("Template sync: backend returned status {}", response.status());
        return SyncResult { synced_count: 0, failed_count: 0, is_online: false };
    }

    let body = match response.json::<BackendSyncResponse>().await {
        Ok(b) => b,
        Err(e) => {
            warn!("Template sync: failed to parse response: {}", e);
            return SyncResult { synced_count: 0, failed_count: 0, is_online: true };
        }
    };

    let mut synced_count = 0u32;
    let mut failed_count = 0u32;

    for tmpl in &body.templates {
        // Build template JSON that matches our local schema
        let local_json = serde_json::json!({
            "name": tmpl.name,
            "description": tmpl.description,
            "sections": tmpl.sections,
            "global_instruction": tmpl.global_instruction,
            "clinical_safety_rules": tmpl.clinical_safety_rules,
            "version": tmpl.version,
            "updated_at": tmpl.updated_at,
        });

        let json_string = serde_json::to_string_pretty(&local_json).unwrap_or_default();

        // Validate before saving
        match templates::validate_and_parse_template(&json_string) {
            Ok(_) => {
                match templates::save_synced_template(&tmpl.template_id, &json_string) {
                    Ok(_) => synced_count += 1,
                    Err(e) => {
                        error!("Failed to save synced template '{}': {}", tmpl.template_id, e);
                        failed_count += 1;
                    }
                }
            }
            Err(e) => {
                warn!("Skipping invalid template '{}' from backend: {}", tmpl.template_id, e);
                failed_count += 1;
            }
        }
    }

    info!("Template sync completed: {} synced, {} failed", synced_count, failed_count);
    SyncResult { synced_count, failed_count, is_online: true }
}

/// Syncs templates from the backend (MongoDB) to the local synced cache
#[tauri::command]
pub async fn api_sync_templates<R: Runtime>(
    _app: tauri::AppHandle<R>,
) -> Result<SyncResult, String> {
    info!("api_sync_templates called");
    Ok(sync_templates_internal().await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_list_templates() {
        // This test requires the templates to be embedded/available
        // In a real test environment, you might want to mock the templates module

        // For now, just verify the function compiles and runs
        // You can expand this with more specific assertions
    }

    #[tokio::test]
    async fn test_validate_template_valid() {
        let valid_json = r#"
        {
            "name": "Test Template",
            "description": "A test template",
            "sections": [
                {
                    "title": "Summary",
                    "instruction": "Provide a summary",
                    "format": "paragraph"
                }
            ]
        }"#;

        // Mock app handle would be needed for actual testing
        // For now, test the validation logic directly
        let result = templates::validate_and_parse_template(valid_json);
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_validate_template_invalid() {
        let invalid_json = "invalid json";

        let result = templates::validate_and_parse_template(invalid_json);
        assert!(result.is_err());
    }
}
