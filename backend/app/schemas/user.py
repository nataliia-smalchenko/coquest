from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict
from datetime import datetime
from typing import Optional
import re
import uuid
from enum import Enum


class UserRole(str, Enum):
    TEACHER = "teacher"
    STUDENT = "student"


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    role: UserRole  # Automatically creates a dropdown in Swagger docs


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    """Google ID token from frontend"""

    token: str
    role: Optional[str] = "student"


class UserResponse(UserBase):
    id: uuid.UUID
    auth_provider: str
    is_email_verified: bool
    avatar_url: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class EmailVerificationRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr
