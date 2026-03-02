/**
 * Authentication service for communicating with the cloud API.
 *
 * All auth requests go to the CLOUD_API_URL, not the local backend.
 */

import { invoke } from '@tauri-apps/api/core'

// Cloud API URL — configurable via environment or fetched from local backend
let cloudApiUrl: string = process.env.NEXT_PUBLIC_CLOUD_API_URL || ''

export async function initCloudApiUrl(): Promise<void> {
  if (cloudApiUrl) return
  try {
    const res = await fetch('http://localhost:5167/api/config')
    if (res.ok) {
      const data = await res.json()
      if (data.cloud_api_url) {
        cloudApiUrl = data.cloud_api_url
      }
    }
  } catch {
    console.warn('[AuthService] Could not fetch cloud API URL from local backend')
  }
}

function getBaseUrl(): string {
  return cloudApiUrl || 'http://localhost:5167'
}

// ── Token management (Tauri secure store) ───────────────────────────

export async function getAccessToken(): Promise<string | null> {
  try {
    return await invoke<string | null>('auth_get_access_token')
  } catch {
    return null
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await invoke<string | null>('auth_get_refresh_token')
  } catch {
    return null
  }
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await invoke('auth_save_tokens', { accessToken, refreshToken })
}

export async function clearTokens(): Promise<void> {
  await invoke('auth_clear_tokens')
}

async function saveAuthUserId(userId: string): Promise<void> {
  await invoke('auth_save_user_id', { userId })
}

export async function getAuthUserId(): Promise<string | null> {
  try {
    return await invoke<string | null>('auth_get_user_id')
  } catch {
    return null
  }
}

// ── Authenticated fetch helper ──────────────────────────────────────

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return fetch(`${getBaseUrl()}${path}`, { ...options, headers })
}

// ── Auth API calls ──────────────────────────────────────────────────

export interface UserProfile {
  user_id: string
  email: string
  display_name: string | null
  devices: DeviceSummary[]
}

export interface DeviceSummary {
  device_id: string
  linked_at: string
  platform: string | null
  last_seen: string | null
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: UserProfile
}

export async function register(
  email: string,
  password: string,
  deviceId: string,
  displayName?: string,
): Promise<AuthResponse> {
  const res = await fetch(`${getBaseUrl()}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      device_id: deviceId,
      display_name: displayName || null,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Registration failed' }))
    throw new Error(err.detail || 'Registration failed')
  }
  const data: AuthResponse = await res.json()
  await saveTokens(data.access_token, data.refresh_token)
  await saveAuthUserId(data.user.user_id)
  return data
}

export async function login(
  email: string,
  password: string,
  deviceId: string,
): Promise<AuthResponse> {
  const res = await fetch(`${getBaseUrl()}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, device_id: deviceId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Login failed' }))
    throw new Error(err.detail || 'Login failed')
  }
  const data: AuthResponse = await res.json()
  await saveTokens(data.access_token, data.refresh_token)
  await saveAuthUserId(data.user.user_id)
  return data
}

export async function refreshTokens(): Promise<AuthResponse | null> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return null

  const res = await fetch(`${getBaseUrl()}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!res.ok) {
    // Refresh failed — clear tokens
    await clearTokens()
    return null
  }
  const data: AuthResponse = await res.json()
  await saveTokens(data.access_token, data.refresh_token)
  return data
}

export async function logout(): Promise<void> {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' })
  } catch {
    // Best-effort
  }
  await clearTokens()
}

export async function getMe(): Promise<UserProfile | null> {
  const res = await authFetch('/api/auth/me')
  if (!res.ok) return null
  return res.json()
}

export async function linkDevice(deviceId: string, platform?: string): Promise<void> {
  await authFetch('/api/auth/link-device', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId, platform }),
  })
}
