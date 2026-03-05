import redis.asyncio as aioredis
from app.config import settings


class RedisService:
    _redis = None

    @classmethod
    async def get_redis(cls):
        """Get Redis connection (async)"""
        if cls._redis is None:
            cls._redis = await aioredis.from_url(
                settings.REDIS_URL, encoding="utf-8", decode_responses=True
            )
        return cls._redis

    @classmethod
    async def close_redis(cls):
        """Close Redis connection"""
        if cls._redis:
            await cls._redis.close()

    @classmethod
    async def set(cls, key: str, value: str, ttl: int = None):
        """Set key-value in Redis"""
        redis = await cls.get_redis()
        if ttl:
            await redis.setex(key, ttl, value)
        else:
            await redis.set(key, value)

    @classmethod
    async def get(cls, key: str) -> str:
        """Get value from Redis"""
        redis = await cls.get_redis()
        return await redis.get(key)

    @classmethod
    async def delete(cls, key: str):
        """Delete key from Redis"""
        redis = await cls.get_redis()
        await redis.delete(key)
