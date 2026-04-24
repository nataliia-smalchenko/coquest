from contextlib import asynccontextmanager

import structlog
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.core.logger import configure_logging
from app.core.rate_limit import limiter
from app.services.redis_service import RedisService

# Configure structlog before anything else logs
configure_logging(json_logs=not settings.DEBUG if hasattr(settings, "DEBUG") else True)

log = structlog.get_logger(__name__)

from app.database import get_db
from app.routes import admin
from app.routes import auth
from app.routes import user
from app.routes import resources
from app.routes import maps
from app.routes import quests
from app.routes import runs
from app.routes import websocket as ws_routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup", version=settings.VERSION)
    await RedisService.get_redis()
    yield
    log.info("shutdown")
    await RedisService.close_redis()


app = FastAPI(
    lifespan=lifespan,
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(
    request: Request, exc: SQLAlchemyError
) -> JSONResponse:
    error_str = str(exc)
    if (
        "UndefinedTableError" in error_str
        or "relation" in error_str
        and "does not exist" in error_str
    ):
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Database schema not initialized. Run: alembic upgrade head"
            },
        )
    if "ConnectionRefusedError" in error_str or "Connection refused" in error_str:
        return JSONResponse(
            status_code=503,
            content={"detail": "Database connection refused. Is PostgreSQL running?"},
        )
    return JSONResponse(
        status_code=500,
        content={"detail": "Database error"},
    )


app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(user.router)
app.include_router(resources.router)
app.include_router(maps.router)
app.include_router(quests.router)
app.include_router(runs.router)
app.include_router(ws_routes.router)


@app.get("/api/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    # Probe the database rather than blindly returning 200
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"status": "healthy", "version": settings.VERSION}


@app.get("/")
async def root():
    return {"message": "CoQuest API", "docs": "/api/docs"}
