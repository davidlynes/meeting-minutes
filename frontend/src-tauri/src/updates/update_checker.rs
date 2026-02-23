use crate::api::api::APP_SERVER_URL;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Response shape from the backend /api/releases/latest endpoint.
#[derive(Debug, Deserialize)]
struct ApiReleaseResponse {
    available: bool,
    version: String,
    release_date: Option<String>,
    download_url: Option<String>,
    release_notes: Option<String>,
    whats_new: Option<Vec<String>>,
}

/// Result returned to the frontend via Tauri invoke.
#[derive(Debug, Serialize, Clone)]
pub struct UpdateCheckResult {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub date: Option<String>,
    pub body: Option<String>,
    pub download_url: Option<String>,
    pub whats_new: Option<Vec<String>>,
}

fn parse_semver(v: &str) -> Option<(u64, u64, u64)> {
    let v = v.strip_prefix('v').unwrap_or(v);
    let parts: Vec<&str> = v.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    Some((
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ))
}

fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_semver(latest), parse_semver(current)) {
        (Some(l), Some(c)) => l > c,
        _ => false,
    }
}

/// Extract a string from a BSON value, handling both plain strings and DateTime objects.
fn bson_to_string(val: &mongodb::bson::Bson) -> Option<String> {
    match val {
        mongodb::bson::Bson::String(s) => Some(s.clone()),
        mongodb::bson::Bson::DateTime(dt) => Some(dt.to_string()),
        _ => None,
    }
}

/// Check for updates via direct MongoDB query.
async fn check_updates_via_mongodb(current_version: &str) -> Result<UpdateCheckResult, String> {
    use mongodb::bson::{doc, Document};

    let collection = crate::mongodb_client::get_collection::<Document>("releases").await?;

    let filter = doc! { "is_latest": true };

    let release = collection
        .find_one(filter)
        .sort(doc! { "release_date": -1 })
        .await
        .map_err(|e| format!("MongoDB query failed: {e}"))?
        .ok_or_else(|| "No release found in MongoDB".to_string())?;

    let version = release
        .get_str("version")
        .map(|s| s.to_string())
        .map_err(|_| "Release missing version field".to_string())?;

    let available = is_newer(&version, current_version);

    let date = release.get("release_date").and_then(bson_to_string);
    let download_url = release.get_str("download_url").ok().map(|s| s.to_string());
    let release_notes = release.get_str("release_notes").ok().map(|s| s.to_string());
    let whats_new = release.get_array("whats_new").ok().map(|arr| {
        arr.iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect()
    });

    log::info!(
        "MongoDB update check: latest={}, current={}, available={}",
        version,
        current_version,
        available
    );

    Ok(UpdateCheckResult {
        available,
        current_version: current_version.to_string(),
        version: Some(version),
        date,
        body: release_notes,
        download_url,
        whats_new,
    })
}

/// Check for updates via the backend HTTP API (fallback).
async fn check_updates_via_api(current_version: &str) -> Result<UpdateCheckResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let url = format!(
        "{}/api/releases/latest?current_version={}",
        APP_SERVER_URL, current_version
    );

    let response = client.get(&url).send().await.map_err(|e| {
        log::warn!("Update check failed (backend unreachable): {}", e);
        "Could not reach the update server. Please ensure the backend is running.".to_string()
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        log::warn!("Update check returned HTTP {}: {}", status, body);
        return Err(format!("Update server returned an error (HTTP {})", status));
    }

    let release: ApiReleaseResponse = response.json().await.map_err(|e| {
        log::warn!("Failed to parse update response: {}", e);
        format!("Invalid response from update server: {e}")
    })?;

    let available = release.available || is_newer(&release.version, current_version);

    log::info!(
        "API update check: latest={}, current={}, available={}",
        release.version,
        current_version,
        available
    );

    Ok(UpdateCheckResult {
        available,
        current_version: current_version.to_string(),
        version: Some(release.version),
        date: release.release_date,
        body: release.release_notes,
        download_url: release.download_url,
        whats_new: release.whats_new,
    })
}

#[tauri::command]
pub async fn check_for_updates(current_version: String) -> Result<UpdateCheckResult, String> {
    log::info!(
        "Checking for updates (current version: {})",
        current_version
    );

    // Try MongoDB first if configured
    if crate::mongodb_client::is_configured() {
        match check_updates_via_mongodb(&current_version).await {
            Ok(result) => return Ok(result),
            Err(e) => {
                log::warn!("MongoDB update check failed, falling back to API: {}", e);
            }
        }
    }

    // Fallback to HTTP API
    check_updates_via_api(&current_version).await
}
