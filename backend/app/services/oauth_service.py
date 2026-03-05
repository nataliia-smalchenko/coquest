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
    def get_google_oauth():
        """Get Google OAuth client"""
        return oauth.google

    @staticmethod
    async def verify_google_token(access_token: str) -> dict:
        """
        Verify a Google Access Token by calling the Google UserInfo endpoint.
        Returns mapped user information if the token is valid.
        """
        try:
            # Робимо запит до Google для перевірки Access Token
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"},
                )

                if resp.status_code != 200:
                    print(f"Google API Error: {resp.text}")
                    raise ValueError(
                        f"Google verification failed. Status: {resp.status_code}"
                    )

                user_info = resp.json()

            # Мапимо дані від Google у структуру, яку очікує наш AuthService
            return {
                "google_id": user_info.get("sub"),
                "email": user_info.get("email"),
                "full_name": user_info.get("name", ""),
                "avatar_url": user_info.get("picture"),
                "email_verified": user_info.get("email_verified", False),
            }

        except Exception as e:
            raise ValueError(f"Invalid Google token or verification failed: {str(e)}")
