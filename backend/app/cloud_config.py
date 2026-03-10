"""
Cloud configuration endpoint.

Provides a simple endpoint for the desktop app to discover the cloud API URL
and deployment mode. Available in both local and cloud deployment modes.
"""

import os
import logging

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config", tags=["config"])

DEPLOYMENT_MODE = os.getenv("DEPLOYMENT_MODE", "local")
CLOUD_API_URL = os.getenv("CLOUD_API_URL", "")


@router.get("")
async def get_config():
    """Return deployment configuration for the desktop app."""
    return {
        "deployment_mode": DEPLOYMENT_MODE,
        "cloud_api_url": CLOUD_API_URL,
        "version": "1.0.0",
    }
