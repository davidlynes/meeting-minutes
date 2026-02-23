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

#[tauri::command]
pub async fn check_for_updates(current_version: String) -> Result<UpdateCheckResult, String> {
    log::info!(
        "Checking for updates (current version: {})",
        current_version
    );

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

    // Client-side semver check as a fallback (the API already does this)
    let available = release.available || is_newer(&release.version, &current_version);

    log::info!(
        "Latest release: {} (current: {}) — update available: {}",
        release.version,
        current_version,
        available
    );

    Ok(UpdateCheckResult {
        available,
        current_version,
        version: Some(release.version),
        date: release.release_date,
        body: release.release_notes,
        download_url: release.download_url,
        whats_new: release.whats_new,
    })
}
