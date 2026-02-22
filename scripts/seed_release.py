#!/usr/bin/env python3
"""
Seed the 'releases' collection in MongoDB with the initial release record.
Safe to re-run (upserts based on version).

Usage:
    python scripts/seed_release.py
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load env from backend/.env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "iqcapture")

RELEASE = {
    "version": "0.2.1",
    "release_date": datetime.now(timezone.utc),
    "download_url": "https://github.com/Zackriya-Solutions/meeting-minutes/releases",
    "release_notes": "Initial IQ:capture release with rebranding, MongoDB template sync, and improved model downloads.",
    "whats_new": [
        "Rebranded to IQ:capture",
        "Templates now sync from MongoDB for centralised management",
        "Fixed model download URLs (Gemma and Parakeet)",
        "Removed GitHub references from the UI",
    ],
    "is_latest": True,
    "min_version": None,
    "platform": "all",
    "created_at": datetime.now(timezone.utc),
}


async def main():
    print(f"Connecting to MongoDB: {MONGODB_URI}")
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[MONGODB_DATABASE]
    collection = db["releases"]

    # Create unique index on version
    await collection.create_index("version", unique=True)
    await collection.create_index("is_latest")

    # Unmark any previous latest
    await collection.update_many(
        {"is_latest": True},
        {"$set": {"is_latest": False}},
    )

    # Upsert the release
    result = await collection.update_one(
        {"version": RELEASE["version"]},
        {"$set": RELEASE},
        upsert=True,
    )

    if result.upserted_id:
        print(f"Inserted release v{RELEASE['version']}")
    else:
        print(f"Updated release v{RELEASE['version']}")

    # Verify
    doc = await collection.find_one({"is_latest": True})
    if doc:
        print(f"Latest release: v{doc['version']} (is_latest={doc['is_latest']})")
    else:
        print("WARNING: No latest release found!")

    client.close()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
