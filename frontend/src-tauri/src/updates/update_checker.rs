use mongodb::{
    bson::doc,
    options::ClientOptions,
    Client, Collection,
};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// MongoDB URI is injected at compile time via the MONGODB_URI environment variable.
/// This keeps credentials out of source control.
///
/// Set it before building:
///   set MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
const MONGO_URI: &str = env!("MONGODB_URI", "MONGODB_URI env var must be set at build time");
const DB_NAME: &str = "iqcapture";
const COLLECTION_NAME: &str = "releases";

static MONGO_CLIENT: OnceCell<Client> = OnceCell::new();

/// Document shape matching the `releases` collection in MongoDB.
#[derive(Debug, Deserialize)]
struct ReleaseDoc {
    version: String,
    release_date: Option<String>,
    release_notes: Option<String>,
    download_url: Option<String>,
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

async fn get_client() -> Result<&'static Client, String> {
    if let Some(client) = MONGO_CLIENT.get() {
        return Ok(client);
    }

    let mut opts = ClientOptions::parse(MONGO_URI)
        .await
        .map_err(|e| format!("Failed to parse MongoDB URI: {e}"))?;

    opts.connect_timeout = Some(Duration::from_secs(5));
    opts.server_selection_timeout = Some(Duration::from_secs(5));

    let client =
        Client::with_options(opts).map_err(|e| format!("Failed to create MongoDB client: {e}"))?;

    Ok(MONGO_CLIENT.get_or_init(|| client))
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

    let client = get_client().await?;

    let collection: Collection<ReleaseDoc> =
        client.database(DB_NAME).collection(COLLECTION_NAME);

    let release = collection
        .find_one(doc! { "is_latest": true })
        .await
        .map_err(|e| format!("MongoDB query failed: {e}"))?;

    let release = match release {
        Some(r) => r,
        None => {
            log::info!("No release document found with is_latest: true");
            return Ok(UpdateCheckResult {
                available: false,
                current_version,
                version: None,
                date: None,
                body: None,
                download_url: None,
                whats_new: None,
            });
        }
    };

    let available = is_newer(&release.version, &current_version);

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
