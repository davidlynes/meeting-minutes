# Mandatory Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make authentication mandatory for all users in all deployment modes — the app is gated behind login/activation, with auth always handled by a remote cloud API and MongoDB Atlas.

**Architecture:** Remove the `DEPLOYMENT_MODE` conditional gating so auth routes are always registered and JWT/MongoDB are always required at startup. Add a frontend auth gate component that blocks the entire app UI until the user is authenticated. Keep `/api/config` and `/health` as the only unauthenticated endpoints. Docker compose updated to pass auth env vars for local testing against cloud MongoDB.

**Tech Stack:** FastAPI (Python), React/Next.js (TypeScript), Tauri, MongoDB Atlas, JWT (PyJWT), Docker Compose

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/main.py` | Modify | Remove DEPLOYMENT_MODE gating on auth routes; always register all routers; always validate auth env vars on startup; add `/health` endpoint |
| `backend/app/device_routes.py` | Modify | Always require `get_current_user` — remove optional auth fallback |
| `backend/app/cloud_config.py` | Modify | Remove `deployment_mode` from config response (no longer meaningful for auth) |
| `frontend/src/components/Auth/AuthGate.tsx` | Create | Wraps app content; shows auth modal if not authenticated; blocks all interaction |
| `frontend/src/app/layout.tsx` | Modify | Insert `AuthGate` inside `AuthProvider` to gate the entire app |
| `backend/docker-compose.yml` | Modify | Add auth env vars to backend services |
| `backend/.env.example` | Create | Document all required env vars for local dev |
| `backend/tests/test_main_auth_mandatory.py` | Create | Tests that auth routes load and startup validates env vars |
| `frontend/src/components/Auth/AuthGate.test.tsx` | Create | Tests for auth gate rendering logic |

---

### Task 1: Add `/health` Endpoint and Remove DEPLOYMENT_MODE Auth Gating (Backend)

**Files:**
- Modify: `backend/app/main.py:45-122`
- Create: `backend/tests/test_main_auth_mandatory.py`

The core change: auth routes are always registered, env vars are always validated, and a dedicated `/health` endpoint replaces the current health check on `/get-meetings`.

- [ ] **Step 1: Write failing test — auth routes always registered**

Create `backend/tests/test_main_auth_mandatory.py`:

```python
"""Tests that auth is mandatory regardless of DEPLOYMENT_MODE."""
import os
import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def required_env(monkeypatch):
    """Set all required env vars for auth startup."""
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-at-least-32-characters-long")
    monkeypatch.setenv("MONGODB_URI", "mongodb://localhost:27017/test")
    monkeypatch.setenv("SENDGRID_API_KEY", "SG.fake-key-for-testing")


@pytest.mark.asyncio
async def test_health_endpoint_returns_ok(required_env):
    """GET /health must be available and unauthenticated."""
    # Patch MongoDB check so startup doesn't fail
    with patch("main.check_mongo_connection", new_callable=AsyncMock, return_value=True), \
         patch("main.ensure_indexes", new_callable=AsyncMock):
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_auth_routes_registered_in_local_mode(required_env, monkeypatch):
    """Auth endpoints must exist even when DEPLOYMENT_MODE=local."""
    monkeypatch.setenv("DEPLOYMENT_MODE", "local")
    with patch("main.check_mongo_connection", new_callable=AsyncMock, return_value=True), \
         patch("main.ensure_indexes", new_callable=AsyncMock):
        # Force reimport to pick up env change
        import importlib
        import main
        importlib.reload(main)
        app = main.app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Auth login endpoint should exist (returns 422 for missing body, not 404)
            resp = await client.post("/api/auth/login")
            assert resp.status_code != 404, "Auth routes not registered in local mode"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend && python -m pytest tests/test_main_auth_mandatory.py -v
```

Expected: FAIL — `/health` returns 404, auth routes return 404 in local mode.

- [ ] **Step 3: Modify `main.py` — always register auth routes and add health endpoint**

In `backend/app/main.py`, replace the conditional routing block (lines 69-87) and startup validation (lines 90-122) with:

```python
# ── Route registration (auth is ALWAYS mandatory) ──────────────────────
app.include_router(config_router)

from auth_routes import router as auth_router
from usage_routes import router as usage_router
app.include_router(auth_router)
app.include_router(usage_router)
app.include_router(device_router)
app.include_router(template_router)
app.include_router(release_router)
logger.info("All routes registered — auth is mandatory")


@app.get("/health")
async def health_check():
    """Unauthenticated health check for Docker/orchestrator probes."""
    return {"status": "ok"}


@app.on_event("startup")
async def startup_event():
    """Validate auth configuration and create MongoDB indexes."""
    required_vars = {
        "JWT_SECRET": os.getenv("JWT_SECRET", ""),
        "MONGODB_URI": os.getenv("MONGODB_URI", ""),
    }
    missing = [k for k, v in required_vars.items() if not v]
    if missing:
        raise RuntimeError(
            f"FATAL: Missing required env vars: {', '.join(missing)}"
        )

    jwt_secret = required_vars["JWT_SECRET"]
    if len(jwt_secret) < 32:
        raise RuntimeError(
            f"FATAL: JWT_SECRET must be at least 32 characters. "
            f"Current length: {len(jwt_secret)}"
        )

    # SendGrid is optional — falls back to logging codes to console
    if not os.getenv("SENDGRID_API_KEY"):
        logger.warning("SENDGRID_API_KEY not set — verification codes will be logged to console")

    from mongodb import check_mongo_connection, ensure_indexes
    if not await check_mongo_connection():
        raise RuntimeError("FATAL: Cannot connect to MongoDB. Check MONGODB_URI.")

    await ensure_indexes()
    logger.info("Startup checks passed — auth mandatory, MongoDB connected")
```

Also remove the `DEPLOYMENT_MODE` variable declaration at line 21 and the CORS conditional block (lines 51-58). Replace CORS with:

```python
# CORS — use explicit origins in production, permissive in development
_cors_raw = os.getenv("CORS_ORIGINS", "")
if _cors_raw:
    _allow_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
else:
    _allow_origins = ["*"]
    logger.warning("CORS_ORIGINS not set — allowing all origins (development only)")
```

Remove the line `DEPLOYMENT_MODE = os.getenv("DEPLOYMENT_MODE", "local")`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend && python -m pytest tests/test_main_auth_mandatory.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/davidlynes/Documents/meeting-notes
git add backend/app/main.py backend/tests/test_main_auth_mandatory.py
git commit -m "feat: make auth routes mandatory in all deployment modes

Remove DEPLOYMENT_MODE conditional gating. Auth routes, usage routes,
and MongoDB are now always required. Add /health endpoint for
unauthenticated Docker health checks. SENDGRID_API_KEY is optional
(falls back to console logging)."
```

---

### Task 2: Remove Optional Auth from Device Routes

**Files:**
- Modify: `backend/app/device_routes.py:15-21`
- Modify: `backend/tests/test_device_routes.py` (update tests expecting optional auth)

- [ ] **Step 1: Update test to expect auth required**

In `backend/tests/test_device_routes.py`, find any tests that expect unauthenticated access to succeed and update them to expect 401/403. Specifically, check for tests that rely on `DEPLOYMENT_MODE=local` allowing unauthenticated access.

Read the test file first to identify which tests need updating. The key change: all device route tests must provide a valid JWT token or expect a 401 response.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend && python -m pytest tests/test_device_routes.py -v
```

Expected: Some tests may fail if they relied on optional auth.

- [ ] **Step 3: Modify `device_routes.py` — always require auth**

In `backend/app/device_routes.py`, replace lines 15-21:

```python
# Old:
from auth_middleware import get_current_user, get_optional_user
...
DEPLOYMENT_MODE = os.getenv("DEPLOYMENT_MODE", "local")
# In cloud mode, require authentication; in local mode, allow unauthenticated access
_auth_dependency = get_current_user if DEPLOYMENT_MODE == "cloud" else get_optional_user
```

With:

```python
from auth_middleware import get_current_user
```

Then update the route function signatures to use `get_current_user` directly instead of `_auth_dependency`:

In the `list_devices` function, change `current_user: dict | None = Depends(_auth_dependency)` to `current_user: dict = Depends(get_current_user)`.

In the `toggle_advanced_logs` function, make the same change.

Remove any `if current_user is None` guard blocks — the dependency now guarantees a user.

Also remove `import os` and the `DEPLOYMENT_MODE` line if they're only used for the auth conditional.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend && python -m pytest tests/test_device_routes.py -v
```

Expected: PASS (tests updated in Step 1 to match new auth-required behaviour)

- [ ] **Step 5: Commit**

```bash
cd /Users/davidlynes/Documents/meeting-notes
git add backend/app/device_routes.py backend/tests/test_device_routes.py
git commit -m "feat: require authentication on all device routes

Remove optional auth fallback. Device listing and log toggling now
always require a valid JWT access token."
```

---

### Task 3: Clean Up `cloud_config.py`

**Files:**
- Modify: `backend/app/cloud_config.py`

- [ ] **Step 1: Read the current file**

```bash
cat backend/app/cloud_config.py
```

- [ ] **Step 2: Remove `deployment_mode` from config response**

The `/api/config` endpoint no longer needs to expose `deployment_mode` since there's no mode distinction for auth. Keep the endpoint (frontend uses it to discover the cloud API URL), but remove the mode field.

Update the response dict to remove the `"deployment_mode"` key. Keep `cloud_api_url` and `version`.

Also remove the `DEPLOYMENT_MODE` variable from this file.

- [ ] **Step 3: Run existing tests**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend && python -m pytest tests/ -v -k "config" 2>/dev/null || echo "No config tests found"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/davidlynes/Documents/meeting-notes
git add backend/app/cloud_config.py
git commit -m "chore: remove deployment_mode from config endpoint

Auth is now mandatory in all modes. The deployment_mode field
is no longer meaningful and has been removed from /api/config."
```

---

### Task 4: Create Frontend Auth Gate Component

**Files:**
- Create: `frontend/src/components/Auth/AuthGate.tsx`
- Create: `frontend/src/components/Auth/AuthGate.test.tsx`
- Modify: `frontend/src/components/Auth/index.ts` (add export)

This component wraps the entire app. If the user is not authenticated, it shows the AuthModal full-screen and blocks all interaction. If authenticated, it renders children normally.

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/Auth/AuthGate.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { AuthGate } from './AuthGate'

// Mock useAuth
const mockUseAuth = jest.fn()
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock Analytics
jest.mock('@/lib/analytics', () => ({
  __esModule: true,
  default: { getPersistentUserId: jest.fn().mockResolvedValue('test-device-id') },
}))

// Mock AuthModal
jest.mock('./AuthModal', () => ({
  __esModule: true,
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="auth-modal">Auth Modal</div> : null,
}))

describe('AuthGate', () => {
  it('shows loading spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true })
    render(<AuthGate><div data-testid="app-content">App</div></AuthGate>)
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('auth-loading')).toBeInTheDocument()
  })

  it('shows auth modal when not authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
    render(<AuthGate><div data-testid="app-content">App</div></AuthGate>)
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('auth-modal')).toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false })
    render(<AuthGate><div data-testid="app-content">App</div></AuthGate>)
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
    expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/davidlynes/Documents/meeting-notes/frontend && npx jest --testPathPattern="AuthGate.test" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — module `./AuthGate` not found.

- [ ] **Step 3: Implement AuthGate component**

Create `frontend/src/components/Auth/AuthGate.tsx`:

```tsx
'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import AuthModal from './AuthModal'
import Analytics from '@/lib/analytics'

interface AuthGateProps {
  children: React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const [deviceId, setDeviceId] = useState<string>('')

  useEffect(() => {
    Analytics.getPersistentUserId()
      .then((id) => setDeviceId(id || ''))
      .catch(() => {})
  }, [])

  if (isLoading) {
    return (
      <div
        data-testid="auth-loading"
        className="flex items-center justify-center h-screen w-screen bg-gray-50"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-50">
        <AuthModal
          isOpen={true}
          onClose={() => {}}
          onSuccess={() => {}}
          deviceId={deviceId}
        />
      </div>
    )
  }

  return <>{children}</>
}
```

- [ ] **Step 4: Export from barrel file**

In `frontend/src/components/Auth/index.ts`, add the export:

```typescript
export { AuthGate } from './AuthGate'
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/davidlynes/Documents/meeting-notes/frontend && npx jest --testPathPattern="AuthGate.test" --no-coverage 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/davidlynes/Documents/meeting-notes
git add frontend/src/components/Auth/AuthGate.tsx frontend/src/components/Auth/AuthGate.test.tsx frontend/src/components/Auth/index.ts
git commit -m "feat: add AuthGate component to block app until authenticated

Shows loading spinner during session restore, then either the full
AuthModal (if not signed in) or the app content (if signed in).
The modal cannot be dismissed — users must authenticate to proceed."
```

---

### Task 5: Wire AuthGate into App Layout

**Files:**
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Read current layout**

Read `frontend/src/app/layout.tsx` to see the current provider nesting.

- [ ] **Step 2: Insert AuthGate after AuthProvider**

The `AuthGate` must wrap everything below `AuthProvider` but above the rest of the app. This ensures:
- `useAuth()` is available inside `AuthGate`
- All other providers and app content are blocked until authenticated

In `layout.tsx`, add the import:

```typescript
import { AuthGate } from '@/components/Auth'
```

Then wrap the content inside `AuthProvider`:

```tsx
<AuthProvider>
  <AuthGate>
    <AnalyticsProvider>
      {/* ... rest of providers and content unchanged ... */}
    </AnalyticsProvider>
  </AuthGate>
</AuthProvider>
```

- [ ] **Step 3: Remove sign-in button from Sidebar**

In `frontend/src/components/Sidebar/index.tsx`, the sign-in button (lines 827-840) is no longer needed — users can't reach the sidebar without being authenticated. Replace the conditional block:

```tsx
{/* Auth: Sign In button or User Profile */}
<div className="w-full px-1 mt-1">
  {isAuthenticated ? (
    <UserProfileMenu />
  ) : (
    <button
      onClick={() => setShowAuthModal(true)}
      className="w-full flex items-center justify-center px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
    >
      <LogIn className="w-4 h-4 mr-2" />
      <span>Sign In</span>
    </button>
  )}
</div>
```

With just the profile menu (no conditional — user is always authenticated at this point):

```tsx
{/* User Profile */}
<div className="w-full px-1 mt-1">
  <UserProfileMenu />
</div>
```

Also remove the `showAuthModal` state, the `AuthModal` rendering, the `LogIn` icon import, and the `isAuthenticated` destructure from `useAuth()` if no longer used elsewhere in the file.

- [ ] **Step 4: Run frontend tests**

```bash
cd /Users/davidlynes/Documents/meeting-notes/frontend && npx jest --no-coverage 2>&1 | tail -30
```

Fix any test failures caused by the layout change (e.g., tests that render the Sidebar and expect the sign-in button).

- [ ] **Step 5: Commit**

```bash
cd /Users/davidlynes/Documents/meeting-notes
git add frontend/src/app/layout.tsx frontend/src/components/Sidebar/index.tsx
git commit -m "feat: wire AuthGate into app layout, remove sidebar sign-in

AuthGate wraps the entire app inside AuthProvider. Users must
authenticate before any app content is visible. Sign-in button
removed from sidebar — replaced with always-visible UserProfileMenu."
```

---

### Task 6: Update Docker Compose and Create .env.example

**Files:**
- Modify: `backend/docker-compose.yml`
- Create: `backend/.env.example`

- [ ] **Step 1: Create `.env.example`**

Create `backend/.env.example`:

```bash
# ── Required ─────────────────────────────────────────────────────────
# JWT signing secret (minimum 32 characters)
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
JWT_SECRET=

# MongoDB Atlas connection string
# Format: mongodb+srv://user:pass@cluster.mongodb.net/iqcapture?retryWrites=true&w=majority
MONGODB_URI=

# ── Optional ─────────────────────────────────────────────────────────
# SendGrid API key for email delivery (verification codes, password resets)
# If not set, codes are logged to console (development only)
SENDGRID_API_KEY=

# Sender email for verification/reset emails
SENDGRID_FROM_EMAIL=noreply@meetily.app

# CORS allowed origins (comma-separated). If not set, allows all origins.
CORS_ORIGINS=

# Ollama host for LLM summarisation
OLLAMA_HOST=http://host.docker.internal:11434
```

- [ ] **Step 2: Update docker-compose.yml backend services**

In both `meetily-backend` and `meetily-backend-macos` services, add auth environment variables:

```yaml
    environment:
      - PYTHONUNBUFFERED=1
      - PYTHONPATH=/app
      - DATABASE_PATH=/app/data/meeting_minutes.db
      - OLLAMA_HOST=${OLLAMA_HOST:-http://host.docker.internal:11434}
      - JWT_SECRET=${JWT_SECRET}
      - MONGODB_URI=${MONGODB_URI}
      - SENDGRID_API_KEY=${SENDGRID_API_KEY:-}
      - SENDGRID_FROM_EMAIL=${SENDGRID_FROM_EMAIL:-noreply@meetily.app}
      - CORS_ORIGINS=${CORS_ORIGINS:-}
```

Also update the health check endpoint from `/get-meetings` to `/health`:

```yaml
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5167/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
```

- [ ] **Step 3: Add `.env.example` to `.gitignore` exclusion and `.env` to ignore**

Verify `backend/.env` is in `.gitignore` (it should be — secrets must never be committed). Verify `.env.example` is NOT ignored.

```bash
cd /Users/davidlynes/Documents/meeting-notes && grep -n "\.env" .gitignore
```

- [ ] **Step 4: Commit**

```bash
cd /Users/davidlynes/Documents/meeting-notes
git add backend/.env.example backend/docker-compose.yml
git commit -m "feat: add auth env vars to Docker compose and .env.example

Backend services now receive JWT_SECRET, MONGODB_URI, and optional
SENDGRID_API_KEY from environment. Health check updated to /health.
.env.example documents all required and optional variables."
```

---

### Task 7: Integration Smoke Test

**Files:**
- No new files — manual verification

This task verifies the full flow works end-to-end with Docker Desktop.

- [ ] **Step 1: Create local `.env` from template**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend
cp .env.example .env
```

Edit `.env` and fill in:
- `JWT_SECRET` — generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- `MONGODB_URI` — your MongoDB Atlas connection string
- `SENDGRID_API_KEY` — optional for dev (codes log to console)

- [ ] **Step 2: Start Docker backend**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend
docker compose --profile macos up --build meetily-backend-macos
```

Watch the logs for:
- `Startup checks passed — auth mandatory, MongoDB connected`
- No `FATAL:` errors

- [ ] **Step 3: Verify health and auth endpoints**

```bash
# Health check (should work without auth)
curl http://localhost:5167/health
# Expected: {"status":"ok"}

# Auth login (should return 422 for missing body, NOT 404)
curl -X POST http://localhost:5167/api/auth/login
# Expected: 422 Unprocessable Entity (validation error)

# Meeting endpoint (should still work — local SQLite, no auth on these yet)
curl http://localhost:5167/get-meetings
# Expected: [] (empty array)
```

- [ ] **Step 4: Verify frontend auth gate**

Start the frontend dev server and confirm:
- App shows loading spinner briefly
- Then shows full-screen AuthModal (login form)
- Cannot access any app features without signing in
- After registering/logging in, app content appears
- UserProfileMenu visible in sidebar (no sign-in button)

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend && python -m pytest tests/ -v
cd /Users/davidlynes/Documents/meeting-notes/frontend && npx jest --no-coverage
```

All tests should pass.

---

## Out of Scope (Future Tasks)

These items are intentional non-goals for this plan:

1. **Offline token caching** — After first auth, allow limited offline use with cached JWT. Requires Tauri-side token validation.
2. **Auth on local meeting endpoints** — `/get-meetings`, `/process-transcript`, etc. are localhost-only and gated by the frontend. Adding per-request auth to these is a hardening step for later.
3. **Rate limiting on meeting endpoints** — Usage limits are tracked via `/api/usage/events` but not enforced on local endpoints yet.
4. **Azure deployment config** — This plan covers local Docker testing. Azure App Service, Key Vault, and production CORS config are separate work.
