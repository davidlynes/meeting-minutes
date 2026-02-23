"""
Pydantic models for the release/update API.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class ReleaseModel(BaseModel):
    """A single app release record in MongoDB."""
    version: str
    release_date: datetime = Field(default_factory=datetime.utcnow)
    download_url: Optional[str] = None
    release_notes: Optional[str] = None
    whats_new: Optional[List[str]] = None
    is_latest: bool = False
    min_version: Optional[str] = None
    platform: str = "all"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LatestReleaseResponse(BaseModel):
    """Response shape for the latest release endpoint."""
    available: bool
    version: str
    release_date: Optional[datetime] = None
    download_url: Optional[str] = None
    release_notes: Optional[str] = None
    whats_new: Optional[List[str]] = None
