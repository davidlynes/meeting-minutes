"""
Usage aggregation background task.

Rolls up raw usage_events into daily usage_summaries using
MongoDB $inc / $addToSet upserts for efficient incremental updates.
"""

import logging
from datetime import datetime, timezone

from mongodb import get_usage_events_collection, get_usage_summaries_collection

logger = logging.getLogger(__name__)

# Event type → summary field mapping
_METRIC_MAP = {
    "recording_minutes": "recording_minutes",
    "transcription_minutes": "transcription_minutes",
    "meeting_created": "meetings_count",
    "summary_generated": "summaries_count",
    "active_minutes": "active_minutes",
    "session_started": "sessions_count",
}


async def aggregate_user_usage(user_id: str):
    """Aggregate all un-rolled-up events for a user into daily summaries.

    This is idempotent — calling it multiple times is safe because we
    mark processed events with `aggregated: true`.
    """
    events_col = get_usage_events_collection()
    summaries_col = get_usage_summaries_collection()

    # Find events not yet aggregated
    cursor = events_col.find(
        {"user_id": user_id, "aggregated": {"$ne": True}},
    ).sort("received_at", 1)

    processed_ids = []
    async for event in cursor:
        event_type = event.get("event_type", "")
        value = event.get("value", 0)
        device_id = event.get("device_id", "unknown")
        metadata = event.get("metadata", {})

        # Determine the day bucket from the event timestamp
        try:
            ts = datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00"))
        except (ValueError, KeyError):
            ts = event.get("received_at", datetime.now(timezone.utc))

        day_start = ts.strftime("%Y-%m-%d")

        # Build the upsert for this event
        inc_fields = {}
        add_to_set = {}

        metric_field = _METRIC_MAP.get(event_type)
        if metric_field:
            inc_fields[metric_field] = value

        # Track model usage in metadata
        whisper_model = metadata.get("whisper_model")
        if whisper_model:
            add_to_set["whisper_models_used"] = whisper_model

        llm_provider = metadata.get("llm_provider")
        llm_model = metadata.get("llm_model")
        if llm_provider and llm_model:
            add_to_set["llm_models_used"] = {
                "provider": llm_provider,
                "model": llm_model,
            }

        if not inc_fields and not add_to_set:
            processed_ids.append(event["_id"])
            continue

        update: dict = {"$set": {"updated_at": datetime.now(timezone.utc)}}
        if inc_fields:
            update["$inc"] = inc_fields
        if add_to_set:
            update["$addToSet"] = add_to_set

        # Upsert per-device daily summary
        await summaries_col.update_one(
            {
                "user_id": user_id,
                "device_id": device_id,
                "period_type": "daily",
                "period_start": day_start,
            },
            update,
            upsert=True,
        )

        processed_ids.append(event["_id"])

    # Mark events as aggregated
    if processed_ids:
        await events_col.update_many(
            {"_id": {"$in": processed_ids}},
            {"$set": {"aggregated": True}},
        )
        logger.info(
            f"Aggregated {len(processed_ids)} events for user {user_id}"
        )
