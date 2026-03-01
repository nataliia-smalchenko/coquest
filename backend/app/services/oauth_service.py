from authlib.integrations.starlette_client import OAuth
from authlib.jose import jwt
from app.config import settings

import json
from app.core.redis import redis_client
import httpx

oauth = OAuth()

oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


class OAuthService:
    GOOGLE_CERTS_KEY = "google_auth_certs"
    CERTS_TTL = 86400

    @staticmethod
    async def _get_google_certs() -> dict:
        """
        Fetch Google's public keys from Redis cache or directly from Google's servers.
        """
        # 1Try to retrieve keys from Redis cache
        cached_certs = await redis_client.get(OAuthService.GOOGLE_CERTS_KEY)

        if cached_certs:
            return json.loads(cached_certs)

        # If not in cache, fetch from Google's JWKS endpoint
        async with httpx.AsyncClient() as client:
            try:
                # Google rotates these keys periodically
                resp = await client.get("https://www.googleapis.com/oauth2/v3/certs")
                resp.raise_for_status()
                certs = resp.json()

                # Store in Redis with a 24-hour expiration (TTL)
                await redis_client.setex(
                    OAuthService.GOOGLE_CERTS_KEY,
                    OAuthService.CERTS_TTL,
                    json.dumps(certs),
                )
                return certs
            except Exception as e:
                # Log the error for monitoring
                print(f"Failed to fetch Google certificates: {e}")
                raise ValueError("Could not retrieve Google verification keys")

    @staticmethod
    def get_google_oauth():
        """Get Google OAuth client"""
        return oauth.google

    @staticmethod
    async def verify_google_token(token: str) -> dict:
        """
        Decode and verify a Google ID token using cached public keys.
        Returns user information if the token is valid.
        """
        try:
            public_keys = await OAuthService._get_google_certs()

            # Decode the JWT and verify signature, issuer (iss), and audience (aud)
            claims = jwt.decode(
                token,
                key=public_keys,
                claims_options={
                    # Support both variants of Google's issuer URL
                    "iss": {
                        "essential": True,
                        "values": [
                            "https://accounts.google.com",
                            "accounts.google.com",
                        ],
                    },
                    # Ensure the token was intended for our specific Client ID
                    "aud": {"essential": True, "value": settings.GOOGLE_CLIENT_ID},
                },
            )

            # Map Google claims to our internal user structure
            return {
                "google_id": claims["sub"],
                "email": claims["email"],
                "full_name": claims.get("name", ""),
                "avatar_url": claims.get("picture", None),
                "email_verified": claims.get("email_verified", False),
            }
        except Exception as e:
            await redis_client.delete(OAuthService.GOOGLE_CERTS_KEY)

            raise ValueError(f"Invalid Google token or verification failed: {str(e)}")
