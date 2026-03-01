from datetime import datetime, timedelta, timezone
from typing import Optional, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings

# Password hashing configuration using the bcrypt algorithm
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a stored hash.
    Used during the login process to check user credentials.
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt.
    Used during user registration or password reset.
    """
    return pwd_context.hash(password)


def create_access_token(subject: Any, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a short-lived JWT access token.
    :param subject: Usually the user ID (stored in 'sub' claim).
    :param expires_delta: Optional custom expiration time.
    :return: Encoded JWT string.
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    # Payload includes expiration time, subject ID, and token type
    to_encode = {"exp": expire, "sub": str(subject), "type": "access"}

    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: Any) -> str:
    """
    Create a long-lived JWT refresh token.
    Used to obtain a new access token without re-authenticating the user.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )

    to_encode = {"exp": expire, "sub": str(subject), "type": "refresh"}

    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def verify_token(token: str, token_type: str = "access") -> Optional[dict]:
    """
    Decode and verify a JWT token.
    Checks signature, expiration, and ensures 'type' matches (access vs refresh).
    :return: Dictionary payload if valid, None otherwise.
    """
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )

        # Prevent using a refresh token for regular API access
        if payload.get("type") != token_type:
            return None

        return payload
    except JWTError:
        # Returns None if token is expired, tampered with, or invalid
        return None
