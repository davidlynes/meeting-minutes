"""
Release API router — serves app release info from MongoDB for update checks.
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from release_models import ReleaseModel, LatestReleaseResponse
from mongodb import get_mongo_client, check_mongo_connection

import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/releases", tags=["releases"])


def _get_releases_collection():
    client = get_mongo_client()
    db_name = os.getenv("MONGODB_DATABASE", "iqcapture")
    return client[db_name]["releases"]


async def _ensure_indexes():
    collection = _get_releases_collection()
    await collection.create_index("version", unique=True)
    await collection.create_index("is_latest")


def _doc_to_model(doc: dict) -> ReleaseModel:
    doc.pop("_id", None)
    return ReleaseModel(**doc)


# ---------- Endpoints ----------

@router.get("/latest", response_model=LatestReleaseResponse)
async def get_latest_release(current_version: Optional[str] = None):
    """Get the latest release info for update checking.

    If current_version is provided, compares it to determine if an update
    is available. Otherwise just returns the latest release info.
    """
    try:
        collection = _get_releases_collection()

        doc = await collection.find_one(
            {"is_latest": True},
            sort=[("release_date", -1)],
        )

        if not doc:
            return LatestReleaseResponse(
                available=False,
                version=current_version or "unknown",
            )

        release = _doc_to_model(doc)

        # Determine if update is available by comparing versions
        update_available = False
        if current_version:
            update_available = _is_newer(release.version, current_version)

        return LatestReleaseResponse(
            available=update_available,
            version=release.version,
            release_date=release.release_date,
            download_url=release.download_url,
            release_notes=release.release_notes,
            whats_new=release.whats_new,
        )

    except Exception as e:
        logger.error(f"Failed to get latest release: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Release service unavailable: {e}")


@router.get("", response_model=list[ReleaseModel])
async def list_releases(limit: int = 10):
    """List recent releases, newest first."""
    try:
        collection = _get_releases_collection()
        cursor = collection.find().sort("release_date", -1).limit(limit)
        releases = [_doc_to_model(doc) async for doc in cursor]
        return releases
    except Exception as e:
        logger.error(f"Failed to list releases: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Release service unavailable: {e}")


@router.post("", response_model=ReleaseModel, status_code=201)
async def create_release(release: ReleaseModel):
    """Create a new release record. Marks it as latest and unmarks previous."""
    try:
        collection = _get_releases_collection()
        await _ensure_indexes()

        # Unmark previous latest
        if release.is_latest:
            await collection.update_many(
                {"is_latest": True},
                {"$set": {"is_latest": False}},
            )

        doc = release.model_dump()
        doc["created_at"] = datetime.utcnow()
        await collection.insert_one(doc)

        logger.info(f"Created release {release.version} (is_latest={release.is_latest})")
        return release

    except Exception as e:
        if "duplicate key" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"Release {release.version} already exists")
        logger.error(f"Failed to create release: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Release service unavailable: {e}")


def _is_newer(latest: str, current: str) -> bool:
    """Compare semver strings. Returns True if latest > current."""
    try:
        def parse(v: str) -> tuple:
            return tuple(int(x) for x in v.strip().split("."))
        return parse(latest) > parse(current)
    except (ValueError, AttributeError):
        return latest != current
