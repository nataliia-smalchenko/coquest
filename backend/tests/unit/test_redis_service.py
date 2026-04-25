import pytest
from unittest.mock import AsyncMock, patch

from app.services.redis_service import RedisService


@pytest.fixture(autouse=True)
def reset_redis_singleton():
    """Reset singleton between tests."""
    original = RedisService._redis
    RedisService._redis = None
    yield
    RedisService._redis = original


def _make_mock_redis():
    r = AsyncMock()
    r.set = AsyncMock()
    r.setex = AsyncMock()
    r.get = AsyncMock(return_value="value")
    r.delete = AsyncMock()
    r.close = AsyncMock()
    return r


class TestGetRedis:
    @pytest.mark.asyncio
    async def test_creates_connection_when_none(self):
        mock_redis = _make_mock_redis()
        with patch(
            "app.services.redis_service.aioredis.from_url", new_callable=AsyncMock
        ) as mock_from_url:
            mock_from_url.return_value = mock_redis
            result = await RedisService.get_redis()

        assert result is mock_redis
        assert RedisService._redis is mock_redis

    @pytest.mark.asyncio
    async def test_returns_existing_connection(self):
        mock_redis = _make_mock_redis()
        RedisService._redis = mock_redis

        with patch("app.services.redis_service.aioredis.from_url") as mock_from_url:
            result = await RedisService.get_redis()

        mock_from_url.assert_not_called()
        assert result is mock_redis


class TestCloseRedis:
    @pytest.mark.asyncio
    async def test_closes_existing_connection(self):
        mock_redis = _make_mock_redis()
        RedisService._redis = mock_redis
        await RedisService.close_redis()
        mock_redis.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_does_nothing_when_no_connection(self):
        RedisService._redis = None
        # Should not raise
        await RedisService.close_redis()


class TestSet:
    @pytest.mark.asyncio
    async def test_set_without_ttl(self):
        mock_redis = _make_mock_redis()
        RedisService._redis = mock_redis
        await RedisService.set("key", "value")
        mock_redis.set.assert_called_once_with("key", "value")
        mock_redis.setex.assert_not_called()

    @pytest.mark.asyncio
    async def test_set_with_ttl(self):
        mock_redis = _make_mock_redis()
        RedisService._redis = mock_redis
        await RedisService.set("key", "value", ttl=300)
        mock_redis.setex.assert_called_once_with("key", 300, "value")
        mock_redis.set.assert_not_called()

    @pytest.mark.asyncio
    async def test_set_with_zero_ttl_uses_set(self):
        mock_redis = _make_mock_redis()
        RedisService._redis = mock_redis
        await RedisService.set("key", "val", ttl=0)
        mock_redis.set.assert_called_once_with("key", "val")


class TestGet:
    @pytest.mark.asyncio
    async def test_returns_value(self):
        mock_redis = _make_mock_redis()
        mock_redis.get = AsyncMock(return_value="stored_value")
        RedisService._redis = mock_redis

        result = await RedisService.get("my_key")
        assert result == "stored_value"
        mock_redis.get.assert_called_once_with("my_key")

    @pytest.mark.asyncio
    async def test_returns_none_when_key_missing(self):
        mock_redis = _make_mock_redis()
        mock_redis.get = AsyncMock(return_value=None)
        RedisService._redis = mock_redis

        result = await RedisService.get("missing")
        assert result is None


class TestDelete:
    @pytest.mark.asyncio
    async def test_deletes_key(self):
        mock_redis = _make_mock_redis()
        RedisService._redis = mock_redis
        await RedisService.delete("del_key")
        mock_redis.delete.assert_called_once_with("del_key")
