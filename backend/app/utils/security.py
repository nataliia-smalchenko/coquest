import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional, Any
from jose import JWTError, jwt
from app.config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a stored hash using direct bcrypt.
    Used during the login process to check user credentials.
    """
    try:
        # bcrypt вимагає байти. Також обрізаємо до 72 байтів,
        # щоб уникнути ValueError від самої бібліотеки bcrypt
        password_bytes = plain_password.encode("utf-8")[:72]
        hashed_password_bytes = hashed_password.encode("utf-8")

        return bcrypt.checkpw(password_bytes, hashed_password_bytes)
    except ValueError:
        # Якщо хеш пошкоджений або має невірний формат
        return False


def get_password_hash(password: str) -> str:
    """
    Hash a password using direct bcrypt.
    Used during user registration or password reset.
    """
    # Перетворюємо в байти та обрізаємо до 72 байтів (обмеження алгоритму bcrypt)
    pwd_bytes = password.encode("utf-8")[:72]

    # Генеруємо сіль і хешуємо
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(pwd_bytes, salt)

    # Повертаємо як звичайний рядок для збереження в базі даних
    return hashed_password.decode("utf-8")


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

    # Payload includes expiration time, subject ID, and token type.
    # If subject is a dict (e.g. {"sub": uuid, "email": ..., "role": ...}),
    # merge it directly so keys land at the top level of the JWT claims.
    if isinstance(subject, dict):
        to_encode = {**subject, "exp": expire, "type": "access"}
    else:
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

    if isinstance(subject, dict):
        to_encode = {**subject, "exp": expire, "type": "refresh"}
    else:
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
