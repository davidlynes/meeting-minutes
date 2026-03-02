"""
Pydantic models for authentication endpoints.
"""

from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
import re


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None
    device_id: str  # Current device's user_id from analytics.json

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
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str
    device_id: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()


class RefreshRequest(BaseModel):
    refresh_token: str


class LinkDeviceRequest(BaseModel):
    device_id: str
    platform: Optional[str] = None
    architecture: Optional[str] = None


class DeviceSummary(BaseModel):
    device_id: str
    linked_at: str
    platform: Optional[str] = None
    last_seen: Optional[str] = None


class UserProfile(BaseModel):
    user_id: str
    email: str
    display_name: Optional[str] = None
    devices: List[DeviceSummary] = []


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile
