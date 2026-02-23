#!/usr/bin/env python3
"""
Create indexes for the ``devices`` collection in MongoDB.

Usage:
    MONGODB_URI="mongodb+srv://..." python scripts/create_devices_indexes.py

Defaults to mongodb://localhost:27017 / iqcapture if env vars are not set.
"""

import asyncio
import os
import logging

from motor.motor_asyncio import AsyncIOMotorClient
import pymongo

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "iqcapture")


async def main():
    logger.info("Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=10_000)

    db = client[MONGODB_DATABASE]
    col = db["devices"]

    logger.info("Creating indexes on '%s.devices'...", MONGODB_DATABASE)

    # Unique index on user_id (one document per installation)
    await col.create_index(
        [("user_id", pymongo.ASCENDING)],
        unique=True,
        name="user_id_unique",
    )
    logger.info("  ✓ user_id (unique)")

    # Sparse index on advanced_logs for admin queries
    await col.create_index(
        [("advanced_logs", pymongo.ASCENDING)],
        name="advanced_logs",
    )
    logger.info("  ✓ advanced_logs")

    # Descending index on last_seen for recency sorting
    await col.create_index(
        [("last_seen", pymongo.DESCENDING)],
        name="last_seen_desc",
    )
    logger.info("  ✓ last_seen (descending)")

    logger.info("Done. Indexes:")
    async for idx in col.list_indexes():
        logger.info("  - %s", idx["name"])

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
