use mongodb::{Client, Collection, options::ClientOptions, options::ReadPreference, options::SelectionCriteria};
use std::time::Duration;
use tokio::sync::OnceCell;

/// MongoDB URI set at compile time from MONGODB_URI env var.
const MONGODB_URI: Option<&str> = option_env!("MONGODB_URI");

/// Database name set at compile time (defaults to "iqcapture" if not provided).
const MONGODB_DATABASE: Option<&str> = option_env!("MONGODB_DATABASE");

fn database_name() -> &'static str {
    MONGODB_DATABASE.unwrap_or("iqcapture")
}

/// Returns true if a MongoDB URI was provided at build time.
pub fn is_configured() -> bool {
    matches!(MONGODB_URI, Some(uri) if !uri.is_empty())
}

/// Lazy singleton for the MongoDB client.
static CLIENT: OnceCell<Client> = OnceCell::const_new();

/// Returns a shared MongoDB client, creating it on first call.
/// Times out after 5 seconds for both connection and server selection.
pub async fn get_client() -> Result<&'static Client, String> {
    CLIENT
        .get_or_try_init(|| async {
            let uri = MONGODB_URI.unwrap_or_default();
            // Log masked URI so we can verify the right credentials are compiled in
            if let Some(at_pos) = uri.find('@') {
                log::info!("MongoDB client init: ...@{}", &uri[at_pos + 1..]);
            } else {
                log::info!("MongoDB client init: URI has no @ sign (len={})", uri.len());
            }
            let mut opts = ClientOptions::parse(uri)
                .await
                .map_err(|e| format!("Failed to parse MongoDB URI: {e}"))?;
            opts.connect_timeout = Some(Duration::from_secs(5));
            opts.server_selection_timeout = Some(Duration::from_secs(5));
            // Read-only client: prefer secondaries to reduce primary load
            opts.selection_criteria = Some(SelectionCriteria::ReadPreference(
                ReadPreference::SecondaryPreferred { options: Default::default() },
            ));
            Client::with_options(opts).map_err(|e| format!("Failed to create MongoDB client: {e}"))
        })
        .await
}

/// Returns a typed collection from the configured database.
pub async fn get_collection<T>(name: &str) -> Result<Collection<T>, String>
where
    T: Send + Sync,
{
    let client = get_client().await?;
    Ok(client.database(database_name()).collection::<T>(name))
}

/// Returns a typed collection routed to the primary for write operations.
/// The default client uses SecondaryPreferred which cannot accept writes.
pub async fn get_collection_for_write<T>(name: &str) -> Result<Collection<T>, String>
where
    T: Send + Sync,
{
    let client = get_client().await?;
    let options = mongodb::options::CollectionOptions::builder()
        .selection_criteria(SelectionCriteria::ReadPreference(
            ReadPreference::PrimaryPreferred { options: Default::default() },
        ))
        .build();
    Ok(client
        .database(database_name())
        .collection_with_options::<T>(name, options))
}
