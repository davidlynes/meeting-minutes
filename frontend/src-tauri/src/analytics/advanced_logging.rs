//! Gated PostHog event helpers for advanced (debug-level) logging.
//!
//! Every function in this module checks `is_advanced_logging_enabled()`
//! before doing any work.  When the flag is `false` the cost is a single
//! relaxed atomic load — zero allocation, zero network.

use std::collections::HashMap;

use crate::device_registry::is_advanced_logging_enabled;

/// Helper: fire-and-forget PostHog event via the global analytics client.
async fn send_event(name: &str, props: HashMap<String, String>) {
    if let Some(client) = super::commands::get_analytics_client() {
        if let Err(e) = client.track_event(name, Some(props)).await {
            log::warn!("Advanced logging: failed to send {}: {}", name, e);
        }
    }
}

// ---------------------------------------------------------------------------
// Audio chunk metrics  (pipeline.rs, every 200th chunk)
// ---------------------------------------------------------------------------

pub async fn track_audio_chunk_metrics(
    chunk_id: u64,
    device_type: &str,
    rms: f32,
    peak: f32,
    sample_count: usize,
    mic_buffer_size: usize,
    sys_buffer_size: usize,
) {
    if !is_advanced_logging_enabled() {
        return;
    }
    let mut props = HashMap::new();
    props.insert("chunk_id".into(), chunk_id.to_string());
    props.insert("device_type".into(), device_type.to_string());
    props.insert("rms".into(), format!("{:.6}", rms));
    props.insert("peak".into(), format!("{:.6}", peak));
    props.insert("sample_count".into(), sample_count.to_string());
    props.insert("mic_buffer_size".into(), mic_buffer_size.to_string());
    props.insert("sys_buffer_size".into(), sys_buffer_size.to_string());
    send_event("advanced_audio_chunk", props).await;
}

// ---------------------------------------------------------------------------
// VAD segment  (pipeline.rs, each speech segment)
// ---------------------------------------------------------------------------

pub async fn track_vad_segment(
    duration_ms: f64,
    sample_count: usize,
    start_timestamp_ms: f64,
) {
    if !is_advanced_logging_enabled() {
        return;
    }
    let mut props = HashMap::new();
    props.insert("duration_ms".into(), format!("{:.1}", duration_ms));
    props.insert("sample_count".into(), sample_count.to_string());
    props.insert("start_timestamp_ms".into(), format!("{:.1}", start_timestamp_ms));
    send_event("advanced_vad_segment", props).await;
}

// ---------------------------------------------------------------------------
// Transcription chunk  (worker.rs, each result)
// ---------------------------------------------------------------------------

pub async fn track_transcription_chunk(
    chunk_id: u64,
    text_length: usize,
    confidence: Option<f32>,
    processing_time_ms: u128,
    energy: f32,
    is_partial: bool,
) {
    if !is_advanced_logging_enabled() {
        return;
    }
    let mut props = HashMap::new();
    props.insert("chunk_id".into(), chunk_id.to_string());
    props.insert("text_length".into(), text_length.to_string());
    props.insert(
        "confidence".into(),
        confidence
            .map(|c| format!("{:.2}", c))
            .unwrap_or_else(|| "N/A".into()),
    );
    props.insert("processing_time_ms".into(), processing_time_ms.to_string());
    props.insert("energy".into(), format!("{:.6}", energy));
    props.insert("is_partial".into(), is_partial.to_string());
    send_event("advanced_transcription_chunk", props).await;
}

// ---------------------------------------------------------------------------
// Recording config  (recording_commands.rs, at recording start)
// ---------------------------------------------------------------------------

pub async fn track_recording_config(
    mic_name: &str,
    system_name: Option<&str>,
    sample_rate: u32,
    rnnoise_enabled: bool,
    auto_save: bool,
    model_provider: &str,
    model_name: &str,
) {
    if !is_advanced_logging_enabled() {
        return;
    }
    let mut props = HashMap::new();
    props.insert("mic_name".into(), mic_name.to_string());
    props.insert(
        "system_name".into(),
        system_name.unwrap_or("none").to_string(),
    );
    props.insert("sample_rate".into(), sample_rate.to_string());
    props.insert("rnnoise_enabled".into(), rnnoise_enabled.to_string());
    props.insert("auto_save".into(), auto_save.to_string());
    props.insert("model_provider".into(), model_provider.to_string());
    props.insert("model_name".into(), model_name.to_string());
    send_event("advanced_recording_config", props).await;
}

// ---------------------------------------------------------------------------
// Error reporting  (various locations)
// ---------------------------------------------------------------------------

pub async fn track_advanced_error(
    error_type: &str,
    error_message: &str,
    context: &str,
) {
    if !is_advanced_logging_enabled() {
        return;
    }
    let mut props = HashMap::new();
    props.insert("error_type".into(), error_type.to_string());
    props.insert("error_message".into(), error_message.to_string());
    props.insert("context".into(), context.to_string());
    send_event("advanced_error", props).await;
}
