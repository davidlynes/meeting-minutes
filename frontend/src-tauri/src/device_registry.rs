//! Device registry — registers each installation in MongoDB and polls
//! an `advanced_logs` flag so we can enable debug-level PostHog events
//! for a specific user without affecting everyone else.
//!
//! All MongoDB operations fail silently — the app works identically
//! whether MongoDB is reachable or not.

use mongodb::bson::{self, doc, Document};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, Runtime};

// ---------------------------------------------------------------------------
// Global flags (zero-cost hot-path check)
// ---------------------------------------------------------------------------

static ADVANCED_LOGS_ENABLED: AtomicBool = AtomicBool::new(false);
static INITIALIZED: AtomicBool = AtomicBool::new(false);

/// Returns `true` when the MongoDB `devices` document for this user has
/// `advanced_logs: true`.  Checked in hot paths — single atomic load.
pub fn is_advanced_logging_enabled() -> bool {
    ADVANCED_LOGS_ENABLED.load(Ordering::Relaxed)
}

// ---------------------------------------------------------------------------
// Device info
// ---------------------------------------------------------------------------

fn collect_device_info(user_id: &str) -> Document {
    let os_version = {
        let mut sys = sysinfo::System::new();
        sys.refresh_all();
        sysinfo::System::os_version().unwrap_or_else(|| "unknown".to_string())
    };

    doc! {
        "user_id": user_id,
        "platform": std::env::consts::OS,
        "architecture": std::env::consts::ARCH,
        "app_version": env!("CARGO_PKG_VERSION"),
        "os_version": os_version,
    }
}

// ---------------------------------------------------------------------------
// Device registration (upsert)
// ---------------------------------------------------------------------------

async fn register_device(user_id: &str) {
    if !crate::mongodb_client::is_configured() {
        return;
    }

    let col = match crate::mongodb_client::get_collection_for_write::<Document>("devices").await {
        Ok(c) => c,
        Err(e) => {
            log::warn!("Device registry: cannot get collection: {}", e);
            return;
        }
    };

    let info = collect_device_info(user_id);

    let filter = doc! { "user_id": user_id };
    let update = doc! {
        "$set": {
            "platform": info.get_str("platform").unwrap_or("unknown"),
            "architecture": info.get_str("architecture").unwrap_or("unknown"),
            "app_version": info.get_str("app_version").unwrap_or("unknown"),
            "os_version": info.get_str("os_version").unwrap_or("unknown"),
            "last_seen": bson::DateTime::now(),
        },
        "$setOnInsert": {
            "user_id": user_id,
            "advanced_logs": false,
            "first_seen": bson::DateTime::now(),
        },
        "$inc": {
            "sessions_count": 1_i32,
        },
    };

    let opts = mongodb::options::UpdateOptions::builder()
        .upsert(true)
        .build();

    match col.update_one(filter, update).with_options(opts).await {
        Ok(_) => log::info!("Device registry: registered device for user"),
        Err(e) => log::warn!("Device registry: upsert failed: {}", e),
    }
}

// ---------------------------------------------------------------------------
// Flag polling
// ---------------------------------------------------------------------------

/// Reads `advanced_logs` from the device document and updates the cached flag.
pub async fn refresh_advanced_logs_flag(user_id: &str) {
    if !crate::mongodb_client::is_configured() {
        return;
    }

    let col = match crate::mongodb_client::get_collection::<Document>("devices").await {
        Ok(c) => c,
        Err(_) => return,
    };

    let filter = doc! { "user_id": user_id };
    let opts = mongodb::options::FindOneOptions::builder()
        .projection(doc! { "advanced_logs": 1 })
        .build();

    match col.find_one(filter).with_options(opts).await {
        Ok(Some(doc)) => {
            let enabled = doc.get_bool("advanced_logs").unwrap_or(false);
            let prev = ADVANCED_LOGS_ENABLED.swap(enabled, Ordering::Relaxed);
            if prev != enabled {
                log::info!(
                    "Device registry: advanced_logs changed {} → {}",
                    prev,
                    enabled
                );
            }
        }
        Ok(None) => {
            // Document not found (race / first launch); keep default false
        }
        Err(e) => {
            log::warn!("Device registry: flag poll failed: {}", e);
        }
    }
}

/// Spawns a background task that polls every 5 minutes.
fn start_flag_polling(user_id: String) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
        loop {
            interval.tick().await;
            refresh_advanced_logs_flag(&user_id).await;
        }
    });
}

// ---------------------------------------------------------------------------
// Read user_id from analytics store (Rust-side, no frontend needed)
// ---------------------------------------------------------------------------

/// Reads the `user_id` field from the Tauri store file `analytics.json`.
/// Returns `None` if the file doesn't exist or can't be parsed.
pub async fn read_user_id_from_store<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let data_dir = app.path().app_data_dir().ok()?;
    let store_path = data_dir.join("analytics.json");

    let contents = tokio::fs::read_to_string(&store_path).await.ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&contents).ok()?;
    parsed
        .get("user_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

// ---------------------------------------------------------------------------
// Initialization entry point
// ---------------------------------------------------------------------------

/// Idempotent — safe to call multiple times.  Only the first call spawns
/// the registration + polling tasks.
pub fn initialize_if_needed(user_id: String) {
    if INITIALIZED.swap(true, Ordering::SeqCst) {
        return; // already initialized
    }

    log::info!("Device registry: initializing for user");

    let uid = user_id.clone();
    tokio::spawn(async move {
        // Small delay to avoid contending with other startup I/O
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        register_device(&uid).await;
        refresh_advanced_logs_flag(&uid).await;
    });

    start_flag_polling(user_id);
}
