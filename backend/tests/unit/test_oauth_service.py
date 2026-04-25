import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.oauth_service import (
    OAuthService,
    _fetch_and_cache_google_certs,
    _get_google_certs,
    GOOGLE_CERTS_KEY,
    CERTS_TTL,
)


SAMPLE_CERTS = {
    "keys": [
        {"kid": "key1", "kty": "RSA", "n": "abc", "e": "AQAB"},
        {"kid": "key2", "kty": "RSA", "n": "xyz", "e": "AQAB"},
    ]
}

SAMPLE_PAYLOAD = {
    "sub": "google_user_id_123",
    "email": "user@gmail.com",
    "name": "Test User",
    "picture": "https://pic.com/avatar.jpg",
    "email_verified": True,
    "iss": "https://accounts.google.com",
    "aud": "test_google_id",
}


# _fetch_and_cache_google_certs
class TestFetchAndCacheGoogleCerts:
    @pytest.mark.asyncio
    async def test_fetches_and_stores_in_redis(self):
        mock_response = MagicMock()
        mock_response.json.return_value = SAMPLE_CERTS
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response

        with patch("app.services.oauth_service.httpx.AsyncClient") as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            with patch("app.services.oauth_service.redis_client") as mock_redis:
                mock_redis.setex = AsyncMock()
                result = await _fetch_and_cache_google_certs()

        assert result == SAMPLE_CERTS
        mock_redis.setex.assert_called_once_with(
            GOOGLE_CERTS_KEY, CERTS_TTL, json.dumps(SAMPLE_CERTS)
        )

    @pytest.mark.asyncio
    async def test_raises_on_http_error(self):
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = Exception("HTTP 503")
        mock_response.json.return_value = {}

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response

        with patch("app.services.oauth_service.httpx.AsyncClient") as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            with patch("app.services.oauth_service.redis_client"):
                with pytest.raises(Exception, match="HTTP 503"):
                    await _fetch_and_cache_google_certs()


# _get_google_certs
class TestGetGoogleCerts:
    @pytest.mark.asyncio
    async def test_returns_cached_when_available(self):
        with patch("app.services.oauth_service.redis_client") as mock_redis:
            mock_redis.get = AsyncMock(return_value=json.dumps(SAMPLE_CERTS))
            result = await _get_google_certs()

        assert result == SAMPLE_CERTS

    @pytest.mark.asyncio
    async def test_fetches_when_cache_miss(self):
        with patch("app.services.oauth_service.redis_client") as mock_redis:
            mock_redis.get = AsyncMock(return_value=None)
            with patch(
                "app.services.oauth_service._fetch_and_cache_google_certs",
                new_callable=AsyncMock,
            ) as mock_fetch:
                mock_fetch.return_value = SAMPLE_CERTS
                result = await _get_google_certs()

        assert result == SAMPLE_CERTS
        mock_fetch.assert_called_once()


# OAuthService.verify_google_id_token
class TestVerifyGoogleIdToken:
    @pytest.mark.asyncio
    async def test_returns_user_data_on_valid_token(self):
        with patch(
            "app.services.oauth_service._get_google_certs", new_callable=AsyncMock
        ) as mock_certs:
            mock_certs.return_value = SAMPLE_CERTS
            with patch(
                "app.services.oauth_service.jwt.get_unverified_header"
            ) as mock_header:
                mock_header.return_value = {"kid": "key1"}
                with patch("app.services.oauth_service.jwt.decode") as mock_decode:
                    mock_decode.return_value = SAMPLE_PAYLOAD
                    result = await OAuthService.verify_google_id_token(
                        "fake.credential.token"
                    )

        assert result["google_id"] == "google_user_id_123"
        assert result["email"] == "user@gmail.com"
        assert result["full_name"] == "Test User"
        assert result["avatar_url"] == "https://pic.com/avatar.jpg"
        assert result["email_verified"] is True

    @pytest.mark.asyncio
    async def test_raises_when_key_not_found_and_refresh_fails(self):
        """No matching kid in certs even after cache refresh."""
        with patch(
            "app.services.oauth_service._get_google_certs", new_callable=AsyncMock
        ) as mock_certs:
            mock_certs.return_value = {"keys": [{"kid": "other_key"}]}
            with patch(
                "app.services.oauth_service.jwt.get_unverified_header"
            ) as mock_header:
                mock_header.return_value = {"kid": "unknown_kid"}
                with patch("app.services.oauth_service.redis_client") as mock_redis:
                    mock_redis.delete = AsyncMock()
                    with patch(
                        "app.services.oauth_service._fetch_and_cache_google_certs",
                        new_callable=AsyncMock,
                    ) as mock_fetch:
                        mock_fetch.return_value = {"keys": [{"kid": "still_other"}]}
                        with pytest.raises(
                            ValueError, match="Google public key not found"
                        ):
                            await OAuthService.verify_google_id_token("fake.token")

    @pytest.mark.asyncio
    async def test_invalidates_cache_and_retries_on_unknown_kid(self):
        """When kid is not in cached certs, deletes cache and refetches."""
        stale_certs = {"keys": [{"kid": "old_key"}]}
        fresh_certs = {"keys": [{"kid": "key1", "kty": "RSA"}]}

        with patch(
            "app.services.oauth_service._get_google_certs", new_callable=AsyncMock
        ) as mock_certs:
            mock_certs.return_value = stale_certs
            with patch(
                "app.services.oauth_service.jwt.get_unverified_header"
            ) as mock_header:
                mock_header.return_value = {"kid": "key1"}
                with patch("app.services.oauth_service.redis_client") as mock_redis:
                    mock_redis.delete = AsyncMock()
                    with patch(
                        "app.services.oauth_service._fetch_and_cache_google_certs",
                        new_callable=AsyncMock,
                    ) as mock_fetch:
                        mock_fetch.return_value = fresh_certs
                        with patch(
                            "app.services.oauth_service.jwt.decode"
                        ) as mock_decode:
                            mock_decode.return_value = SAMPLE_PAYLOAD
                            result = await OAuthService.verify_google_id_token(
                                "fake.token"
                            )

        mock_redis.delete.assert_called_once_with(GOOGLE_CERTS_KEY)
        mock_fetch.assert_called_once()
        assert result["google_id"] == "google_user_id_123"

    @pytest.mark.asyncio
    async def test_raises_on_jwt_decode_error(self):
        with patch(
            "app.services.oauth_service._get_google_certs", new_callable=AsyncMock
        ) as mock_certs:
            mock_certs.return_value = SAMPLE_CERTS
            with patch(
                "app.services.oauth_service.jwt.get_unverified_header"
            ) as mock_header:
                mock_header.return_value = {"kid": "key1"}
                with patch("app.services.oauth_service.jwt.decode") as mock_decode:
                    mock_decode.side_effect = Exception(
                        "JWT signature verification failed"
                    )
                    with pytest.raises(ValueError, match="Invalid Google ID token"):
                        await OAuthService.verify_google_id_token("bad.token")

    @pytest.mark.asyncio
    async def test_raises_on_invalid_issuer(self):
        bad_payload = {**SAMPLE_PAYLOAD, "iss": "https://evil.com"}

        with patch(
            "app.services.oauth_service._get_google_certs", new_callable=AsyncMock
        ) as mock_certs:
            mock_certs.return_value = SAMPLE_CERTS
            with patch(
                "app.services.oauth_service.jwt.get_unverified_header"
            ) as mock_header:
                mock_header.return_value = {"kid": "key1"}
                with patch("app.services.oauth_service.jwt.decode") as mock_decode:
                    mock_decode.return_value = bad_payload
                    with pytest.raises(ValueError, match="Invalid token issuer"):
                        await OAuthService.verify_google_id_token("fake.token")

    @pytest.mark.asyncio
    async def test_accepts_alternate_issuer_format(self):
        payload_alt_iss = {**SAMPLE_PAYLOAD, "iss": "accounts.google.com"}

        with patch(
            "app.services.oauth_service._get_google_certs", new_callable=AsyncMock
        ) as mock_certs:
            mock_certs.return_value = SAMPLE_CERTS
            with patch(
                "app.services.oauth_service.jwt.get_unverified_header"
            ) as mock_header:
                mock_header.return_value = {"kid": "key1"}
                with patch("app.services.oauth_service.jwt.decode") as mock_decode:
                    mock_decode.return_value = payload_alt_iss
                    result = await OAuthService.verify_google_id_token("fake.token")

        assert result["email"] == "user@gmail.com"

    @pytest.mark.asyncio
    async def test_handles_missing_optional_fields(self):
        minimal_payload = {
            "sub": "gid",
            "email": "m@gmail.com",
            "iss": "https://accounts.google.com",
            # no "name", no "picture", no "email_verified"
        }

        with patch(
            "app.services.oauth_service._get_google_certs", new_callable=AsyncMock
        ) as mock_certs:
            mock_certs.return_value = SAMPLE_CERTS
            with patch(
                "app.services.oauth_service.jwt.get_unverified_header"
            ) as mock_header:
                mock_header.return_value = {"kid": "key1"}
                with patch("app.services.oauth_service.jwt.decode") as mock_decode:
                    mock_decode.return_value = minimal_payload
                    result = await OAuthService.verify_google_id_token("fake.token")

        assert result["full_name"] == ""
        assert result["avatar_url"] is None
        assert result["email_verified"] is False
