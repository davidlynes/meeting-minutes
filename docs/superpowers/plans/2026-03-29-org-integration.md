# Organisation Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the `organisations` collection into the auth system so that every user belongs to an organisation, JWT tokens carry `org_id`, registration enforces org-level user limits, and admins can invite/manage users.

**Architecture:** Add `org_id` and `org_role` to JWT claims and UserProfile. Add an `org_routes.py` with invite, join, and member management endpoints. Modify registration to require an invite code (or create a new org). Enforce `max_users` from the organisation document. Add `org_id` to audit log and usage events.

**Tech Stack:** FastAPI (Python), MongoDB (Motor), PyJWT, Pydantic, Vitest (frontend)

**Existing state:** The `organisations` collection already exists in MongoDB with one org (Home Instead Sheffield, `91ce31c0-f7d2-4e13-b7a8-8622de6dded9`). Existing users already have `org_id` and `org_role` fields set.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/org_models.py` | Create | Pydantic models for org endpoints |
| `backend/app/org_routes.py` | Create | Organisation management + invite endpoints |
| `backend/app/auth_middleware.py` | Modify | Add `org_id` and `org_role` to JWT claims |
| `backend/app/auth_routes.py` | Modify | Include `org_id` in tokens; enforce `max_users` on register; support invite codes |
| `backend/app/auth_models.py` | Modify | Add `org_id`, `org_role` to UserProfile; add invite_code to RegisterRequest |
| `backend/app/audit_log.py` | Modify | Accept and store `org_id` on every event |
| `backend/app/usage_routes.py` | Modify | Include `org_id` from JWT in usage events |
| `backend/app/main.py` | Modify | Register org_routes router |
| `backend/app/mongodb.py` | Modify | Add `get_organisations_collection()` and `get_invites_collection()` + indexes |
| `backend/tests/test_org_routes.py` | Create | Tests for org management endpoints |
| `backend/tests/test_org_registration.py` | Create | Tests for invite-based registration flow |

---

### Task 1: MongoDB Collections and Helpers

**Files:**
- Modify: `backend/app/mongodb.py`

Add collection accessors for `organisations` and `invites`, plus indexes for the invites collection.

- [ ] **Step 1: Add collection accessors to mongodb.py**

Add these functions after the existing collection accessors (around line 70):

```python
def get_organisations_collection():
    client = get_mongo_client()
    return client[_DB_NAME]["organisations"]


def get_invites_collection():
    client = get_mongo_client()
    return client[_DB_NAME]["invites"]
```

- [ ] **Step 2: Add indexes for invites in `ensure_indexes()`**

Add inside the `ensure_indexes()` function, after the existing index creation:

```python
    # Invites
    await db["invites"].create_index("code", unique=True)
    await db["invites"].create_index("org_id")
    await db["invites"].create_index("email")
    await db["invites"].create_index(
        "expires_at",
        expireAfterSeconds=0,  # TTL: auto-delete after expiry
    )
```

- [ ] **Step 3: Run backend tests to verify no regressions**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend && .venv/bin/python -m pytest tests/test_main_auth_mandatory.py -v
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/mongodb.py
git commit -m "feat: add organisations and invites collection accessors and indexes"
```

---

### Task 2: Add `org_id` and `org_role` to JWT Token Claims

**Files:**
- Modify: `backend/app/auth_middleware.py:82-112`

The JWT access and refresh tokens must carry `org_id` and `org_role` so every authenticated request has org context without a database lookup.

- [ ] **Step 1: Modify `create_access_token` to accept and include org fields**

In `backend/app/auth_middleware.py`, replace `create_access_token` (lines 82-94):

```python
def create_access_token(
    user_id: str,
    device_id: str,
    org_id: Optional[str] = None,
    org_role: Optional[str] = None,
) -> str:
    """Create a short-lived access token."""
    import datetime

    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "sub": user_id,
        "device_id": device_id,
        "type": "access",
        "iat": now,
        "exp": now + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    if org_id:
        payload["org_id"] = org_id
    if org_role:
        payload["org_role"] = org_role
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
```

- [ ] **Step 2: Modify `create_refresh_token` the same way**

Replace `create_refresh_token` (lines 97-112):

```python
def create_refresh_token(
    user_id: str,
    device_id: str,
    family_id: Optional[str] = None,
    org_id: Optional[str] = None,
    org_role: Optional[str] = None,
) -> str:
    """Create a long-lived refresh token with token family tracking."""
    import datetime

    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "sub": user_id,
        "device_id": device_id,
        "type": "refresh",
        "family_id": family_id or str(uuid.uuid4()),
        "iat": now,
        "exp": now + datetime.timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    }
    if org_id:
        payload["org_id"] = org_id
    if org_role:
        payload["org_role"] = org_role
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
```

- [ ] **Step 3: Run existing tests**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend && .venv/bin/python -m pytest tests/test_auth_middleware.py -v
```

Expected: PASS — new params are optional with defaults, so existing callers are unaffected.

- [ ] **Step 4: Commit**

```bash
git add backend/app/auth_middleware.py
git commit -m "feat: add org_id and org_role to JWT token claims"
```

---

### Task 3: Update Auth Models with Org Fields

**Files:**
- Modify: `backend/app/auth_models.py`

Add org fields to `UserProfile` and an optional `invite_code` to `RegisterRequest`.

- [ ] **Step 1: Add `org_id` and `org_role` to `UserProfile`**

In `backend/app/auth_models.py`, update the `UserProfile` class (line 71-77):

```python
class UserProfile(BaseModel):
    user_id: str
    email: str
    display_name: Optional[str] = None
    account_level: Optional[str] = None
    email_verified: Optional[bool] = None
    org_id: Optional[str] = None
    org_role: Optional[str] = None
    org_name: Optional[str] = None
    devices: List[DeviceSummary] = []
```

- [ ] **Step 2: Add `invite_code` to `RegisterRequest`**

Update `RegisterRequest` (line 23-40) — add one field:

```python
class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None
    device_id: str
    invite_code: Optional[str] = None  # If joining an existing org

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email address")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _check_password_complexity(v)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/auth_models.py
git commit -m "feat: add org fields to UserProfile and invite_code to RegisterRequest"
```

---

### Task 4: Update Auth Routes — Org-Aware Registration, Login, and Profile

**Files:**
- Modify: `backend/app/auth_routes.py`

This is the core change: registration checks invite codes and enforces org user limits; login and refresh include `org_id` in tokens; the profile endpoint returns org info.

- [ ] **Step 1: Add org import at top of auth_routes.py**

Add to the imports from `mongodb` (line 22-30):

```python
from mongodb import (
    get_users_collection,
    get_password_resets_collection,
    get_login_attempts_collection,
    get_token_families_collection,
    get_email_verifications_collection,
    get_usage_events_collection,
    get_usage_summaries_collection,
    get_organisations_collection,
    get_invites_collection,
)
```

- [ ] **Step 2: Update `_user_to_profile` to include org fields**

Replace `_user_to_profile` (lines 140-163):

```python
def _user_to_profile(doc: dict, org_name: Optional[str] = None) -> UserProfile:
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
        account_level=doc.get("account_level", "free"),
        email_verified=doc.get("email_verified", True),
        org_id=doc.get("org_id"),
        org_role=doc.get("org_role"),
        org_name=org_name,
        devices=devices,
    )
```

- [ ] **Step 3: Add helper to look up org name**

Add after `_user_to_profile`:

```python
async def _get_org_name(org_id: Optional[str]) -> Optional[str]:
    """Look up organisation name by ID. Returns None if not found."""
    if not org_id:
        return None
    org = await get_organisations_collection().find_one(
        {"org_id": org_id}, {"name": 1}
    )
    return org["name"] if org else None
```

- [ ] **Step 4: Add invite validation helper**

Add after `_get_org_name`:

```python
async def _validate_invite(invite_code: str, email: str) -> dict:
    """Validate an invite code and return the invite doc. Raises on failure."""
    invites_col = get_invites_collection()
    invite = await invites_col.find_one({"code": invite_code})
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid invite code",
        )
    if invite.get("used"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite code has already been used",
        )
    now = datetime.now(timezone.utc)
    if invite.get("expires_at") and invite["expires_at"] < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite code has expired",
        )
    # If invite is for a specific email, enforce it
    if invite.get("email") and invite["email"].lower() != email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite code is not valid for this email address",
        )
    # Check org user limit
    org = await get_organisations_collection().find_one({"org_id": invite["org_id"]})
    if not org:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organisation no longer exists",
        )
    if org.get("max_users"):
        current_count = await get_users_collection().count_documents({"org_id": org["org_id"]})
        if current_count >= org["max_users"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Organisation has reached its maximum of {org['max_users']} users",
            )
    return invite
```

- [ ] **Step 5: Update `register` endpoint to handle invite codes**

In the `register` function (line 217-274), after the existing-user check and before creating `user_doc`, add invite handling. Replace the `user_doc` creation block:

```python
    # Handle org assignment via invite code
    org_id = None
    org_role = "member"
    if req.invite_code:
        invite = await _validate_invite(req.invite_code, req.email)
        org_id = invite["org_id"]
        org_role = invite.get("role", "member")
        # Mark invite as used
        await get_invites_collection().update_one(
            {"code": req.invite_code},
            {"$set": {"used": True, "used_by": req.email, "used_at": now}},
        )

    user_doc = {
        "user_id": user_id,
        "email": req.email,
        "password_hash": password_hash,
        "display_name": req.display_name,
        "created_at": now,
        "updated_at": now,
        "last_login_at": now,
        "status": "active",
        "account_level": "free",
        "email_verified": False,
        "org_id": org_id,
        "org_role": org_role,
        "devices": [_make_device_entry(req.device_id)],
    }
```

And update the token creation to include org fields:

```python
    access = create_access_token(user_id, req.device_id, org_id=org_id, org_role=org_role)
    refresh = create_refresh_token(user_id, req.device_id, family_id, org_id=org_id, org_role=org_role)
```

And update the profile return to include org name:

```python
    org_name = await _get_org_name(org_id)
    return AuthResponse(
        access_token=access,
        refresh_token=refresh,
        user=_user_to_profile(user_doc, org_name=org_name),
    )
```

- [ ] **Step 6: Update `login` endpoint to include org in tokens**

In the `login` function, find where `create_access_token` and `create_refresh_token` are called and add org fields:

```python
    org_id = user.get("org_id")
    org_role = user.get("org_role")
    access = create_access_token(user_id, req.device_id, org_id=org_id, org_role=org_role)
    refresh = create_refresh_token(user_id, req.device_id, family_id, org_id=org_id, org_role=org_role)
```

Also update the profile return:

```python
    org_name = await _get_org_name(org_id)
    return AuthResponse(
        access_token=access,
        refresh_token=refresh,
        user=_user_to_profile(user, org_name=org_name),
    )
```

- [ ] **Step 7: Update `refresh` endpoint similarly**

Find the `refresh` function and add org fields to the new token creation. The user doc is fetched during refresh — read `org_id` and `org_role` from it:

```python
    org_id = user.get("org_id")
    org_role = user.get("org_role")
    new_access = create_access_token(user_id, device_id, org_id=org_id, org_role=org_role)
    new_refresh = create_refresh_token(user_id, device_id, new_family_id, org_id=org_id, org_role=org_role)
```

- [ ] **Step 8: Update `/me` endpoint to include org name**

Find the `get_me` / profile endpoint and update:

```python
    org_name = await _get_org_name(user.get("org_id"))
    return _user_to_profile(user, org_name=org_name)
```

- [ ] **Step 9: Update `_get_max_devices` to check org-level override**

Replace the `_get_max_devices` function:

```python
async def _get_max_devices(user: dict) -> int:
    """Get max devices — org setting overrides account level."""
    org_id = user.get("org_id")
    if org_id:
        org = await get_organisations_collection().find_one(
            {"org_id": org_id}, {"max_devices_per_user": 1}
        )
        if org and org.get("max_devices_per_user"):
            return org["max_devices_per_user"]
    level = user.get("account_level", "free")
    return ACCOUNT_LEVEL_LIMITS.get(level, DEFAULT_MAX_DEVICES)
```

Note: this changes `_get_max_devices` from sync to async. Update all call sites — `_check_device_limit` must also become async, and callers must `await` it. Find all calls to `_check_device_limit` and add `await`.

Update `_check_device_limit`:

```python
async def _check_device_limit(user: dict, new_device_id: str):
    """Raise 403 if adding a new device would exceed the limit."""
    device_ids = [d["device_id"] for d in user.get("devices", [])]
    if new_device_id in device_ids:
        return
    max_devices = await _get_max_devices(user)
    if len(device_ids) >= max_devices:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Maximum {max_devices} devices allowed.",
        )
```

- [ ] **Step 10: Commit**

```bash
git add backend/app/auth_routes.py
git commit -m "feat: org-aware registration, login, refresh, and device limits

Registration accepts invite_code to join an org. Tokens now carry
org_id and org_role. Device limits check org-level max_devices_per_user.
Profile endpoint returns org_name."
```

---

### Task 5: Add `org_id` to Audit Log and Usage Events

**Files:**
- Modify: `backend/app/audit_log.py`
- Modify: `backend/app/usage_routes.py`

- [ ] **Step 1: Add `org_id` to `log_event`**

In `backend/app/audit_log.py`, update the function signature and document:

```python
async def log_event(
    event_type: str,
    user_id: str = None,
    email: str = None,
    ip: str = None,
    org_id: str = None,
    metadata: dict = None,
):
    """Write a structured audit log entry. Never raises — failures are logged."""
    try:
        doc = {
            "event_type": event_type,
            "user_id": user_id,
            "email": email,
            "ip": ip,
            "timestamp": datetime.now(timezone.utc),
            "metadata": metadata or {},
        }
        if org_id:
            doc["org_id"] = org_id
        await get_audit_log_collection().insert_one(doc)
    except Exception as e:
        logger.error(f"Failed to write audit log ({event_type}): {e}")
```

- [ ] **Step 2: Update `log_event` calls in auth_routes.py to include org_id**

Search for all `await log_event(` calls in `auth_routes.py` and add `org_id=org_id` where the user's org_id is available. For example in the register function:

```python
    await log_event("register", user_id=user_id, email=req.email, ip=ip, org_id=org_id)
```

And in login:

```python
    await log_event("login", user_id=user_id, email=req.email, ip=ip, org_id=org_id)
```

Do this for all `log_event` calls where user context is available.

- [ ] **Step 3: Add `org_id` to usage events**

In `backend/app/usage_routes.py`, update the `ingest_events` function to include `org_id` from the JWT:

```python
@router.post("/events")
async def ingest_events(
    req: BatchUsageEventsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Batch ingest usage events from a device."""
    user_id = current_user["sub"]
    org_id = current_user.get("org_id")
    col = get_usage_events_collection()

    now = datetime.now(timezone.utc)
    docs = []
    for event in req.events:
        doc = {
            "user_id": user_id,
            "device_id": req.device_id,
            "event_type": event.event_type.value,
            "value": event.value,
            "metadata": event.metadata or {},
            "session_id": event.session_id,
            "timestamp": event.timestamp,
            "received_at": now,
        }
        if org_id:
            doc["org_id"] = org_id
        if event.client_event_id:
            doc["client_event_id"] = event.client_event_id
        docs.append(doc)
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/audit_log.py backend/app/usage_routes.py backend/app/auth_routes.py
git commit -m "feat: add org_id to audit log entries and usage events"
```

---

### Task 6: Organisation Management Routes

**Files:**
- Create: `backend/app/org_models.py`
- Create: `backend/app/org_routes.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create org models**

Create `backend/app/org_models.py`:

```python
"""Pydantic models for organisation management endpoints."""

from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
import re


class CreateInviteRequest(BaseModel):
    email: Optional[str] = None  # If set, invite is locked to this email
    role: str = "member"  # member or admin

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email address")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("member", "admin"):
            raise ValueError("Role must be 'member' or 'admin'")
        return v


class InviteResponse(BaseModel):
    code: str
    org_id: str
    org_name: str
    email: Optional[str] = None
    role: str
    expires_at: str
    used: bool = False


class OrgMemberResponse(BaseModel):
    user_id: str
    email: str
    display_name: Optional[str] = None
    org_role: str
    status: str
    last_login_at: Optional[str] = None


class OrgDetailResponse(BaseModel):
    org_id: str
    name: str
    slug: str
    status: str
    plan: str
    max_users: int
    max_devices_per_user: int
    current_user_count: int
    members: List[OrgMemberResponse]


class UpdateMemberRoleRequest(BaseModel):
    role: str  # member, admin, or owner

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("member", "admin", "owner"):
            raise ValueError("Role must be 'member', 'admin', or 'owner'")
        return v
```

- [ ] **Step 2: Create org routes**

Create `backend/app/org_routes.py`:

```python
"""
Organisation management API routes.

Provides endpoints for viewing org details, inviting users,
managing members, and listing invites. Requires authentication.
Owner/admin roles enforced where appropriate.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from mongodb import get_organisations_collection, get_invites_collection, get_users_collection
from auth_middleware import get_current_user
from org_models import (
    CreateInviteRequest,
    InviteResponse,
    OrgDetailResponse,
    OrgMemberResponse,
    UpdateMemberRoleRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/org", tags=["organisation"])

INVITE_EXPIRY_DAYS = 7


def _require_org(current_user: dict) -> str:
    """Extract org_id from JWT or raise 403."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of any organisation",
        )
    return org_id


def _require_admin(current_user: dict) -> str:
    """Extract org_id and verify admin/owner role, or raise 403."""
    org_id = _require_org(current_user)
    role = current_user.get("org_role", "member")
    if role not in ("admin", "owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or owner role required",
        )
    return org_id


@router.get("", response_model=OrgDetailResponse)
async def get_org_detail(current_user: dict = Depends(get_current_user)):
    """Get the current user's organisation details and member list."""
    org_id = _require_org(current_user)
    org = await get_organisations_collection().find_one({"org_id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    users_col = get_users_collection()
    members = []
    async for user in users_col.find({"org_id": org_id}, {"password_hash": 0}):
        members.append(OrgMemberResponse(
            user_id=user["user_id"],
            email=user["email"],
            display_name=user.get("display_name"),
            org_role=user.get("org_role", "member"),
            status=user.get("status", "active"),
            last_login_at=user["last_login_at"].isoformat()
            if user.get("last_login_at") and hasattr(user["last_login_at"], "isoformat")
            else None,
        ))

    user_count = await users_col.count_documents({"org_id": org_id})

    return OrgDetailResponse(
        org_id=org["org_id"],
        name=org["name"],
        slug=org["slug"],
        status=org.get("status", "active"),
        plan=org.get("plan", "free"),
        max_users=org.get("max_users", 25),
        max_devices_per_user=org.get("max_devices_per_user", 3),
        current_user_count=user_count,
        members=members,
    )


@router.post("/invites", response_model=InviteResponse)
async def create_invite(
    req: CreateInviteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create an invite code for the current org. Requires admin/owner role."""
    org_id = _require_admin(current_user)
    org = await get_organisations_collection().find_one({"org_id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    # Check user limit before creating invite
    if org.get("max_users"):
        current_count = await get_users_collection().count_documents({"org_id": org_id})
        if current_count >= org["max_users"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Organisation has reached its maximum of {org['max_users']} users",
            )

    now = datetime.now(timezone.utc)
    code = secrets.token_urlsafe(16)
    invite_doc = {
        "code": code,
        "org_id": org_id,
        "email": req.email,
        "role": req.role,
        "created_by": current_user["sub"],
        "created_at": now,
        "expires_at": now + timedelta(days=INVITE_EXPIRY_DAYS),
        "used": False,
    }

    await get_invites_collection().insert_one(invite_doc)
    logger.info(f"Invite created for org {org['name']} by {current_user['sub']}")

    return InviteResponse(
        code=code,
        org_id=org_id,
        org_name=org["name"],
        email=req.email,
        role=req.role,
        expires_at=invite_doc["expires_at"].isoformat(),
    )


@router.get("/invites", response_model=list[InviteResponse])
async def list_invites(current_user: dict = Depends(get_current_user)):
    """List pending invites for the current org. Requires admin/owner role."""
    org_id = _require_admin(current_user)
    org = await get_organisations_collection().find_one({"org_id": org_id}, {"name": 1})
    org_name = org["name"] if org else "Unknown"

    invites_col = get_invites_collection()
    results = []
    async for invite in invites_col.find({"org_id": org_id}).sort("created_at", -1):
        results.append(InviteResponse(
            code=invite["code"],
            org_id=org_id,
            org_name=org_name,
            email=invite.get("email"),
            role=invite.get("role", "member"),
            expires_at=invite["expires_at"].isoformat()
            if hasattr(invite["expires_at"], "isoformat")
            else str(invite["expires_at"]),
            used=invite.get("used", False),
        ))
    return results


@router.delete("/invites/{code}")
async def revoke_invite(code: str, current_user: dict = Depends(get_current_user)):
    """Revoke a pending invite. Requires admin/owner role."""
    org_id = _require_admin(current_user)
    result = await get_invites_collection().delete_one({"code": code, "org_id": org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invite not found")
    return {"message": "Invite revoked"}


@router.patch("/members/{user_id}/role")
async def update_member_role(
    user_id: str,
    req: UpdateMemberRoleRequest,
    current_user: dict = Depends(get_current_user),
):
    """Change a member's role. Only owners can promote to admin/owner."""
    org_id = _require_org(current_user)
    caller_role = current_user.get("org_role", "member")

    # Only owners can change roles to admin or owner
    if req.role in ("admin", "owner") and caller_role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the organisation owner can promote to admin or owner",
        )

    # Admins can only set member role
    if caller_role == "admin" and req.role != "member":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins can only set members to 'member' role",
        )

    # Members cannot change roles at all
    if caller_role == "member":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    users_col = get_users_collection()
    result = await users_col.update_one(
        {"user_id": user_id, "org_id": org_id},
        {"$set": {"org_role": req.role, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found in this organisation")

    return {"message": f"Role updated to {req.role}"}


@router.delete("/members/{user_id}")
async def remove_member(user_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a member from the org. Requires admin/owner role. Cannot remove owner."""
    org_id = _require_admin(current_user)

    users_col = get_users_collection()
    target = await users_col.find_one({"user_id": user_id, "org_id": org_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found in this organisation")

    if target.get("org_role") == "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot remove the organisation owner",
        )

    await users_col.update_one(
        {"user_id": user_id},
        {"$set": {"org_id": None, "org_role": None, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Member removed from organisation"}
```

- [ ] **Step 3: Register org routes in main.py**

In `backend/app/main.py`, add the import and include the router alongside the other routers:

```python
from org_routes import router as org_router
```

And in the route registration block:

```python
app.include_router(org_router)
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/org_models.py backend/app/org_routes.py backend/app/main.py
git commit -m "feat: add organisation management routes

Endpoints: GET /api/org (detail + members), POST /api/org/invites,
GET /api/org/invites, DELETE /api/org/invites/{code},
PATCH /api/org/members/{user_id}/role, DELETE /api/org/members/{user_id}.
Role-based access: owner > admin > member."
```

---

### Task 7: Rebuild Docker Image and Smoke Test

**Files:**
- No new files — manual verification

- [ ] **Step 1: Rebuild and restart Docker**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend
docker stop meetily-auth-test && docker rm meetily-auth-test
docker build -f Dockerfile.app -t meetily-backend:auth-test .
docker run -d --name meetily-auth-test -p 5167:5167 \
  --env-file .env \
  -v ./data:/app/data \
  meetily-backend:auth-test
sleep 8
docker logs meetily-auth-test 2>&1 | grep -E "INFO|ERROR|Startup" | tail -5
```

Expected: `Startup checks passed` and `Application startup complete`.

- [ ] **Step 2: Test org endpoint**

```bash
# Login as David (owner)
TOKEN=$(curl -s -X POST http://localhost:5167/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"david@uniqueiq.co.uk","password":"YOUR_PASSWORD","device_id":"test-dev"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Get org details
curl -s http://localhost:5167/api/org -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Create invite
curl -s -X POST http://localhost:5167/api/org/invites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@example.com","role":"member"}' | python3 -m json.tool

# List invites
curl -s http://localhost:5167/api/org/invites -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

- [ ] **Step 3: Test invite-based registration**

```bash
# Get the invite code from the previous step, then register with it:
curl -s -X POST http://localhost:5167/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@example.com","password":"TestPass123","device_id":"new-dev-001","invite_code":"THE_CODE"}' \
  | python3 -m json.tool
```

Verify the new user has `org_id` and `org_role` set.

- [ ] **Step 4: Verify JWT contains org claims**

```bash
# Decode the access token (base64 the middle segment)
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool
```

Expected: `org_id` and `org_role` fields present in the payload.

- [ ] **Step 5: Verify audit log and usage events have org_id**

```bash
# Check recent audit entries for org_id
docker exec meetily-auth-test python -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
async def check():
    client = AsyncIOMotorClient(os.getenv('MONGODB_URI'))
    db = client['iqcapture']
    async for e in db.audit_log.find().sort('timestamp', -1).limit(3):
        print(f\"{e.get('event_type')}: org_id={e.get('org_id', 'MISSING')}\")
    client.close()
asyncio.run(check())
"
```

---

## Out of Scope (Future Tasks)

1. **Create new organisation on registration** — Currently registration without an invite code creates an unaffiliated user. A future task could auto-create an org for the first user in a company.
2. **Org settings / branding** — The `settings` field on the org document is an empty object, ready for future use.
3. **Frontend org management UI** — Admin panel for invites, member management, etc.
4. **Org-level billing** — Plan upgrades, seat management, payment integration.
5. **Transfer ownership** — Changing the org owner is not yet implemented as a dedicated flow.
