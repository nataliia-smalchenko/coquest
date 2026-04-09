import json

import httpx
from jose import jwt

from app.config import settings
from app.core.redis import redis_client

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_CERTS_KEY = "google_auth_certs"
CERTS_TTL = 86400  # 24 hours


async def _fetch_and_cache_google_certs() -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(GOOGLE_CERTS_URL)
        resp.raise_for_status()
        certs = resp.json()
    await redis_client.setex(GOOGLE_CERTS_KEY, CERTS_TTL, json.dumps(certs))
    return certs


async def _get_google_certs() -> dict:
    cached = await redis_client.get(GOOGLE_CERTS_KEY)
    if cached:
        return json.loads(cached)
    return await _fetch_and_cache_google_certs()


class OAuthService:
    @staticmethod
    async def verify_google_id_token(credential: str) -> dict:
        """
        Verify a Google ID token (JWT credential from GoogleLogin component).
        Public keys are fetched from Google once and cached in Redis for 24h.
        On key rotation (unknown kid), the cache is invalidated and refreshed once.
        """
        certs = await _get_google_certs()

        header = jwt.get_unverified_header(credential)
        kid = header.get("kid")

        key = next((k for k in certs.get("keys", []) if k.get("kid") == kid), None)

        if not key:
            # Cache is stale — Google rotated keys. Force one refresh.
            await redis_client.delete(GOOGLE_CERTS_KEY)
            certs = await _fetch_and_cache_google_certs()
            key = next((k for k in certs.get("keys", []) if k.get("kid") == kid), None)
            if not key:
                raise ValueError("Google public key not found for this token")

        try:
            payload = jwt.decode(
                credential,
                key,
                algorithms=["RS256"],
                audience=settings.GOOGLE_CLIENT_ID,
            )
        except Exception as exc:
            raise ValueError(f"Invalid Google ID token: {exc}")

        if payload.get("iss") not in (
            "https://accounts.google.com",
            "accounts.google.com",
        ):
            raise ValueError("Invalid token issuer")

        return {
            "google_id": payload.get("sub"),
            "email": payload.get("email"),
            "full_name": payload.get("name", ""),
            "avatar_url": payload.get("picture"),
            "email_verified": payload.get("email_verified", False),
        }
