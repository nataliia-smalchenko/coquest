from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from app.config import settings

from contextlib import asynccontextmanager
from app.services.redis_service import RedisService

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
    # Startup
    await RedisService.get_redis()
    yield
    # Shutdown
    await RedisService.close_redis()


app = FastAPI(
    lifespan=lifespan,
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)


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
async def health_check():
    return {"status": "healthy", "version": settings.VERSION}


@app.get("/")
async def root():
    return {"message": "CoQuest API", "docs": "/api/docs"}
