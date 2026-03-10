//! Usage event buffer with crash-safe disk persistence.
//!
//! Events are buffered in memory and periodically persisted to a JSON
//! file in the app data directory. The frontend flushes the buffer
//! by draining events and POSTing them to the cloud API.
//!
//! Rust-side code (recording_manager, whisper_engine) pushes events
//! directly via `push_event()`. The frontend triggers flushes via
//! the `usage_flush_events` Tauri command.

use serde::{Deserialize, Serialize};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Manager, Runtime};

const BUFFER_FILE: &str = "usage_buffer.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageEvent {
    pub event_type: String,
    pub value: f64,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
    #[serde(default)]
    pub session_id: Option<String>,
    pub timestamp: String,
}

struct UsageBuffer {
    events: Vec<UsageEvent>,
    /// Path to the persistence file (set on first use).
    store_path: Option<std::path::PathBuf>,
}

impl UsageBuffer {
    fn new() -> Self {
        Self {
            events: Vec::new(),
            store_path: None,
        }
    }

    fn set_store_path(&mut self, path: std::path::PathBuf) {
        self.store_path = Some(path);
    }

    fn push(&mut self, event: UsageEvent) {
        self.events.push(event);
        // Auto-persist every 10 events
        if self.events.len() % 10 == 0 {
            if let Err(e) = self.persist() {
                log::warn!("Usage buffer: auto-persist failed: {}", e);
            }
        }
    }

    fn drain(&mut self) -> Vec<UsageEvent> {
        let events = std::mem::take(&mut self.events);
        // Clear the persisted file since we've drained
        if let Some(ref path) = self.store_path {
            let _ = std::fs::write(path, "[]");
        }
        events
    }

    fn persist(&self) -> Result<(), String> {
        let path = self
            .store_path
            .as_ref()
            .ok_or("Store path not set")?;

        let json = serde_json::to_string(&self.events)
            .map_err(|e| format!("Serialize error: {}", e))?;

        // Atomic write
        let temp = path.with_extension("json.tmp");
        std::fs::write(&temp, &json).map_err(|e| format!("Write error: {}", e))?;
        std::fs::rename(&temp, path).map_err(|e| format!("Rename error: {}", e))?;

        Ok(())
    }

    fn load_pending(&mut self) -> usize {
        let path = match self.store_path.as_ref() {
            Some(p) if p.exists() => p,
            _ => return 0,
        };

        let contents = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return 0,
        };

        let loaded: Vec<UsageEvent> = match serde_json::from_str(&contents) {
            Ok(v) => v,
            Err(_) => return 0,
        };

        let count = loaded.len();
        if count > 0 {
            // Prepend loaded events (they're older)
            let mut merged = loaded;
            merged.append(&mut self.events);
            self.events = merged;
            log::info!("Usage buffer: loaded {} pending events from disk", count);
        }
        count
    }
}

static BUFFER: LazyLock<Mutex<UsageBuffer>> = LazyLock::new(|| Mutex::new(UsageBuffer::new()));

/// Initialize the buffer's store path. Call once at app startup.
pub fn initialize<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(data_dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&data_dir);
        let path = data_dir.join(BUFFER_FILE);
        let mut buf = BUFFER.lock().unwrap();
        buf.set_store_path(path);
        buf.load_pending();
    }
}

/// Push a usage event from Rust code (recording_manager, whisper_engine, etc.).
pub fn push_event(event_type: &str, value: f64, metadata: Option<serde_json::Value>) {
    let event = UsageEvent {
        event_type: event_type.to_string(),
        value,
        metadata,
        session_id: None,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    if let Ok(mut buf) = BUFFER.lock() {
        buf.push(event);
    }
}

// ── Tauri Commands ──────────────────────────────────────────────────

/// Track a usage event from the frontend.
#[tauri::command]
pub fn usage_track_event(
    event_type: String,
    value: f64,
    metadata: Option<serde_json::Value>,
) -> Result<(), String> {
    push_event(&event_type, value, metadata);
    Ok(())
}

/// Drain all buffered events for the frontend to send to the cloud API.
#[tauri::command]
pub fn usage_flush_events() -> Result<Vec<UsageEvent>, String> {
    let mut buf = BUFFER.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(buf.drain())
}

/// Get the number of pending events in the buffer.
#[tauri::command]
pub fn usage_get_pending_count() -> Result<usize, String> {
    let buf = BUFFER.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(buf.events.len())
}

/// Persist the current buffer to disk (call on app exit).
#[tauri::command]
pub fn usage_persist_buffer() -> Result<(), String> {
    let buf = BUFFER.lock().map_err(|e| format!("Lock error: {}", e))?;
    buf.persist()
}
