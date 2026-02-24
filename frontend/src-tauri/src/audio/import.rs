use log::{error, info, warn};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_dialog::DialogExt;

use crate::api::api::TranscriptSegment as ApiTranscriptSegment;
use crate::database::repositories::transcript::TranscriptsRepository;
use crate::state::AppState;

use super::audio_processing::create_meeting_folder;
use super::recording_preferences::get_default_recordings_folder;
use super::recording_saver::{MeetingMetadata, DeviceInfo, TranscriptSegment as SaverTranscriptSegment};

/// Progress event emitted to the frontend during import
#[derive(Debug, Clone, Serialize)]
struct ImportProgress {
    stage: String,
    percent: u32,
    message: String,
}

/// Emit an import-progress event to the frontend
fn emit_progress<R: Runtime>(app: &AppHandle<R>, stage: &str, percent: u32, message: &str) {
    let progress = ImportProgress {
        stage: stage.to_string(),
        percent,
        message: message.to_string(),
    };
    if let Err(e) = app.emit("import-progress", &progress) {
        warn!("Failed to emit import-progress event: {}", e);
    }
}

/// Import an audio/video file: decode → transcribe → save to database
#[tauri::command]
pub async fn import_audio_file<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    meeting_name: Option<String>,
) -> Result<serde_json::Value, String> {
    info!("Import audio file requested");

    // 1. Open native file dialog
    let file_path = app
        .dialog()
        .file()
        .add_filter("Audio/Video Files", &["mp4", "m4a", "wav", "mp3", "webm", "ogg"])
        .blocking_pick_file();

    let file_path = match file_path {
        Some(path) => {
            let path_str = path.to_string();
            info!("User selected file: {}", path_str);
            PathBuf::from(path_str)
        }
        None => {
            info!("User cancelled file selection");
            return Ok(serde_json::json!({ "status": "cancelled" }));
        }
    };

    // 2. Derive meeting name
    let title = meeting_name.unwrap_or_else(|| {
        file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Imported Meeting")
            .to_string()
    });
    info!("Import meeting name: {}", title);

    // 3. Create meeting folder
    let base_folder = get_default_recordings_folder();
    let meeting_folder = create_meeting_folder(&base_folder, &title, false)
        .map_err(|e| format!("Failed to create meeting folder: {}", e))?;
    info!("Created meeting folder: {}", meeting_folder.display());

    // 4. Copy source file into meeting folder
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");
    let dest_filename = format!("audio.{}", ext);
    let dest_path = meeting_folder.join(&dest_filename);
    std::fs::copy(&file_path, &dest_path)
        .map_err(|e| format!("Failed to copy audio file: {}", e))?;
    info!("Copied audio to: {}", dest_path.display());

    // 5. Emit decoding progress
    emit_progress(&app, "decoding", 0, "Decoding audio...");

    // 6. Decode audio to 16kHz mono f32 using FFmpeg
    let ffmpeg_path = super::ffmpeg::find_ffmpeg_path()
        .ok_or_else(|| "FFmpeg not found. Please ensure FFmpeg is installed.".to_string())?;

    let samples = decode_audio_to_f32(&ffmpeg_path, &dest_path)
        .map_err(|e| format!("Failed to decode audio: {}", e))?;

    let total_duration_secs = samples.len() as f64 / 16000.0;
    info!(
        "Decoded {} samples ({:.1}s duration)",
        samples.len(),
        total_duration_secs
    );

    emit_progress(&app, "decoding", 100, "Audio decoded successfully");

    // 7. Chunk into 30-second segments
    let chunk_size: usize = 30 * 16000; // 30 seconds at 16kHz
    let chunks: Vec<&[f32]> = samples.chunks(chunk_size).collect();
    let total_chunks = chunks.len();
    info!("Split audio into {} chunks for transcription", total_chunks);

    // 8. Ensure Parakeet model is loaded
    emit_progress(&app, "transcribing", 0, "Preparing transcription engine...");

    let engine = {
        let guard = crate::parakeet_engine::commands::PARAKEET_ENGINE.lock().unwrap();
        guard.as_ref().cloned()
    };

    let engine = match engine {
        Some(e) => e,
        None => {
            error!("Parakeet engine not initialized for import");
            emit_progress(&app, "error", 0, "Transcription engine not initialized");
            return Err("Parakeet engine not initialized. Please ensure a transcription model is downloaded.".to_string());
        }
    };

    if !engine.is_model_loaded().await {
        emit_progress(&app, "transcribing", 0, "Loading transcription model...");
        // Try to validate/load a model
        match crate::parakeet_engine::commands::parakeet_validate_model_ready().await {
            Ok(model_name) => info!("Loaded Parakeet model for import: {}", model_name),
            Err(e) => {
                error!("Failed to load Parakeet model: {}", e);
                emit_progress(&app, "error", 0, "No transcription model available");
                return Err(format!("No transcription model available: {}", e));
            }
        }
    }

    // 9. Transcribe each chunk
    let mut saver_segments: Vec<SaverTranscriptSegment> = Vec::new();
    let mut api_segments: Vec<ApiTranscriptSegment> = Vec::new();

    for (i, chunk) in chunks.iter().enumerate() {
        let percent = ((i + 1) as f64 / total_chunks as f64 * 100.0) as u32;
        let chunk_start_secs = i as f64 * 30.0;
        let chunk_duration_secs = chunk.len() as f64 / 16000.0;

        emit_progress(
            &app,
            "transcribing",
            percent.min(99),
            &format!("Transcribing chunk {}/{}...", i + 1, total_chunks),
        );

        let text = match engine.transcribe_audio(chunk.to_vec()).await {
            Ok(t) => {
                if t.trim().is_empty() {
                    continue; // Skip silent chunks
                }
                t
            }
            Err(e) => {
                warn!("Failed to transcribe chunk {}: {}", i, e);
                continue;
            }
        };

        let audio_start = chunk_start_secs;
        let audio_end = chunk_start_secs + chunk_duration_secs;
        let display_time = format_display_time(audio_start);

        // Segment for disk (recording_saver format)
        saver_segments.push(SaverTranscriptSegment {
            id: format!("seg_{}", i),
            text: text.clone(),
            audio_start_time: audio_start,
            audio_end_time: audio_end,
            duration: chunk_duration_secs,
            display_time: display_time.clone(),
            confidence: 1.0,
            sequence_id: i as u64,
        });

        // Segment for database (api format)
        api_segments.push(ApiTranscriptSegment {
            id: format!("seg_{}", i),
            text,
            timestamp: display_time,
            audio_start_time: Some(audio_start),
            audio_end_time: Some(audio_end),
            duration: Some(chunk_duration_secs),
        });
    }

    info!("Transcription complete: {} segments", saver_segments.len());

    // 10. Save to database
    emit_progress(&app, "saving", 90, "Saving to database...");

    let folder_path_str = meeting_folder.to_string_lossy().to_string();
    let meeting_id = TranscriptsRepository::save_transcript(
        state.db_manager.pool(),
        &title,
        &api_segments,
        Some(folder_path_str.clone()),
    )
    .await
    .map_err(|e| format!("Failed to save transcript to database: {}", e))?;

    info!("Saved meeting to database with ID: {}", meeting_id);

    // 11. Write metadata.json to meeting folder
    let metadata = MeetingMetadata {
        version: "1.0".to_string(),
        meeting_id: Some(meeting_id.clone()),
        meeting_name: Some(title.clone()),
        created_at: chrono::Utc::now().to_rfc3339(),
        completed_at: Some(chrono::Utc::now().to_rfc3339()),
        duration_seconds: Some(total_duration_secs),
        devices: DeviceInfo {
            microphone: None,
            system_audio: None,
        },
        audio_file: dest_filename,
        transcript_file: "transcripts.json".to_string(),
        sample_rate: 16000,
        status: "completed".to_string(),
    };

    let metadata_json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
    std::fs::write(meeting_folder.join("metadata.json"), metadata_json)
        .map_err(|e| format!("Failed to write metadata.json: {}", e))?;

    // 12. Write transcripts.json to meeting folder
    let transcripts_json = serde_json::json!({
        "version": "1.0",
        "segments": saver_segments,
        "last_updated": chrono::Utc::now().to_rfc3339(),
        "total_segments": saver_segments.len()
    });
    let transcripts_str = serde_json::to_string_pretty(&transcripts_json)
        .map_err(|e| format!("Failed to serialize transcripts: {}", e))?;
    std::fs::write(meeting_folder.join("transcripts.json"), transcripts_str)
        .map_err(|e| format!("Failed to write transcripts.json: {}", e))?;

    // 13. Emit completion
    emit_progress(&app, "complete", 100, "Import complete!");

    info!("Audio import complete: meeting_id={}", meeting_id);

    Ok(serde_json::json!({
        "status": "success",
        "meeting_id": meeting_id,
        "meeting_name": title,
        "folder_path": folder_path_str,
        "segments_count": saver_segments.len(),
        "duration_seconds": total_duration_secs
    }))
}

/// Decode an audio/video file to 16kHz mono f32 samples using FFmpeg
fn decode_audio_to_f32(ffmpeg_path: &PathBuf, input_path: &PathBuf) -> Result<Vec<f32>, String> {
    use std::process::Command;

    let output = Command::new(ffmpeg_path)
        .args([
            "-i",
            &input_path.to_string_lossy(),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "pipe:1",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg decoding failed: {}", stderr));
    }

    let bytes = output.stdout;
    if bytes.len() % 4 != 0 {
        return Err("FFmpeg output not aligned to f32 samples".to_string());
    }

    let samples: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();

    Ok(samples)
}

/// Format seconds into a display time string like "[02:15]"
fn format_display_time(seconds: f64) -> String {
    let total_secs = seconds as u64;
    let mins = total_secs / 60;
    let secs = total_secs % 60;
    format!("[{:02}:{:02}]", mins, secs)
}
