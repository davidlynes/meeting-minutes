use std::panic;
use std::sync::OnceLock;

const POSTHOG_API_KEY: &str = "phc_pGkOvu6KylcbbQvyYslzVXdxNgl0nLSJOD0v2oemkuG";
const POSTHOG_ENDPOINT: &str = "https://eu.i.posthog.com/capture/";

static USER_ID: OnceLock<String> = OnceLock::new();

/// Call this when the user is identified so crash events include their distinct_id.
pub fn set_user_id(user_id: String) {
    let _ = USER_ID.set(user_id);
}

pub fn setup_panic_hook() {
    let default_hook = panic::take_hook();

    panic::set_hook(Box::new(move |panic_info| {
        let message = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown panic".to_string()
        };

        let location = panic_info
            .location()
            .map(|loc| format!("{}:{}", loc.file(), loc.line()))
            .unwrap_or_else(|| "unknown".to_string());

        let payload = serde_json::json!({
            "api_key": POSTHOG_API_KEY,
            "event": "app_crash",
            "distinct_id": USER_ID.get().map(|s| s.as_str()).unwrap_or("unknown"),
            "properties": {
                "panic_message": message,
                "panic_location": location,
                "app_version": env!("CARGO_PKG_VERSION"),
                "$lib": "posthog-rust-panic-hook"
            }
        });

        let _ = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .and_then(|client| {
                client
                    .post(POSTHOG_ENDPOINT)
                    .header("Content-Type", "application/json")
                    .body(payload.to_string())
                    .send()
            });

        default_hook(panic_info);
    }));
}
