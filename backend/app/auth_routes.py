"""
Authentication API routes.

Provides registration, login, token refresh, logout, profile,
and device-linking endpoints backed by MongoDB.
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from mongodb import get_users_collection
from auth_models import (
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
    LinkDeviceRequest,
    AuthResponse,
    UserProfile,
    DeviceSummary,
)
from auth_middleware import (
    get_current_user,
    create_access_token,
    create_refresh_token,
    _decode_token,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

ph = PasswordHasher()


# ── Helpers ──────────────────────────────────────────────────────────


def _user_to_profile(doc: dict) -> UserProfile:
    """Convert a MongoDB user document to a UserProfile response."""
    devices = []
    for d in doc.get("devices", []):
        devices.append(
            DeviceSummary(
                device_id=d["device_id"],
                linked_at=d["linked_at"].isoformat()
                if hasattr(d["linked_at"], "isoformat")
                else str(d["linked_at"]),
                platform=d.get("platform"),
                last_seen=d["last_seen"].isoformat()
                if d.get("last_seen") and hasattr(d["last_seen"], "isoformat")
                else None,
            )
        )
    return UserProfile(
        user_id=doc["user_id"],
        email=doc["email"],
        display_name=doc.get("display_name"),
        devices=devices,
    )


def _make_device_entry(device_id: str, platform: str | None = None) -> dict:
    """Create a device sub-document for embedding in the user record."""
    now = datetime.now(timezone.utc)
    return {
        "device_id": device_id,
        "linked_at": now,
        "platform": platform,
        "last_seen": now,
    }


# ── Routes ───────────────────────────────────────────────────────────


@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
    """Create a new user account and link the current device."""
    col = get_users_collection()

    existing = await col.find_one({"email": req.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    password_hash = ph.hash(req.password)

    user_doc = {
        "user_id": user_id,
        "email": req.email,
        "password_hash": password_hash,
        "display_name": req.display_name,
        "created_at": now,
        "updated_at": now,
        "last_login_at": now,
        "status": "active",
        "devices": [_make_device_entry(req.device_id)],
    }

    await col.insert_one(user_doc)

    # Also link device in the devices collection
    await _link_device_in_registry(user_id, req.device_id)

    access = create_access_token(user_id, req.device_id)
    refresh = create_refresh_token(user_id, req.device_id)

    logger.info(f"User registered: {req.email}")
    return AuthResponse(
        access_token=access,
        refresh_token=refresh,
        user=_user_to_profile(user_doc),
    )


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    """Authenticate with email and password."""
    col = get_users_collection()

    user = await col.find_one({"email": req.email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if user.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active",
        )

    try:
        ph.verify(user["password_hash"], req.password)
    except VerifyMismatchError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Rehash if needed (argon2 parameter upgrades)
    if ph.check_needs_rehash(user["password_hash"]):
        new_hash = ph.hash(req.password)
        await col.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"password_hash": new_hash}},
        )

    now = datetime.now(timezone.utc)

    # Link device if not already present
    device_ids = [d["device_id"] for d in user.get("devices", [])]
    if req.device_id not in device_ids:
        await col.update_one(
            {"user_id": user["user_id"]},
            {"$push": {"devices": _make_device_entry(req.device_id)}},
        )
        user["devices"].append(_make_device_entry(req.device_id))

    # Update last_login and device last_seen
    await col.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {
                "last_login_at": now,
                "updated_at": now,
            }
        },
    )
    await col.update_one(
        {"user_id": user["user_id"], "devices.device_id": req.device_id},
        {"$set": {"devices.$.last_seen": now}},
    )

    await _link_device_in_registry(user["user_id"], req.device_id)

    access = create_access_token(user["user_id"], req.device_id)
    refresh = create_refresh_token(user["user_id"], req.device_id)

    logger.info(f"User logged in: {req.email}")
    return AuthResponse(
        access_token=access,
        refresh_token=refresh,
        user=_user_to_profile(user),
    )


@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(req: RefreshRequest):
    """Issue a new access token using a valid refresh token."""
    payload = _decode_token(req.refresh_token, expected_type="refresh")
    user_id = payload["sub"]
    device_id = payload.get("device_id", "")

    col = get_users_collection()
    user = await col.find_one({"user_id": user_id})
    if not user or user.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    access = create_access_token(user_id, device_id)
    # Issue a new refresh token as well (rotation)
    new_refresh = create_refresh_token(user_id, device_id)

    return AuthResponse(
        access_token=access,
        refresh_token=new_refresh,
        user=_user_to_profile(user),
    )


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Logout (client should discard tokens)."""
    logger.info(f"User logged out: {current_user['sub']}")
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get the current user's profile."""
    col = get_users_collection()
    user = await col.find_one({"user_id": current_user["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_profile(user)


@router.post("/link-device")
async def link_device(
    req: LinkDeviceRequest,
    current_user: dict = Depends(get_current_user),
):
    """Associate a device_id with the authenticated user."""
    col = get_users_collection()
    user_id = current_user["sub"]

    user = await col.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    device_ids = [d["device_id"] for d in user.get("devices", [])]
    if req.device_id in device_ids:
        # Update last_seen
        now = datetime.now(timezone.utc)
        await col.update_one(
            {"user_id": user_id, "devices.device_id": req.device_id},
            {"$set": {"devices.$.last_seen": now}},
        )
        return {"message": "Device already linked", "device_id": req.device_id}

    entry = _make_device_entry(req.device_id, platform=req.platform)
    await col.update_one(
        {"user_id": user_id},
        {
            "$push": {"devices": entry},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
    )

    await _link_device_in_registry(user_id, req.device_id)

    logger.info(f"Device {req.device_id} linked to user {user_id}")
    return {"message": "Device linked", "device_id": req.device_id}


@router.get("/devices", response_model=list[DeviceSummary])
async def list_user_devices(current_user: dict = Depends(get_current_user)):
    """List all devices linked to the authenticated user."""
    col = get_users_collection()
    user = await col.find_one({"user_id": current_user["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_profile(user).devices


# ── Internal helpers ─────────────────────────────────────────────────


async def _link_device_in_registry(user_id: str, device_id: str):
    """Update the devices collection to set auth_user_id on the device."""
    try:
        from mongodb import get_mongo_client
        import os

        client = get_mongo_client()
        db_name = os.getenv("MONGODB_DATABASE", "iqcapture")
        devices_col = client[db_name]["devices"]
        await devices_col.update_one(
            {"user_id": device_id},
            {"$set": {"auth_user_id": user_id}},
        )
    except Exception as e:
        logger.warning(f"Failed to link device in registry: {e}")
