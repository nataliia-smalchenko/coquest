from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

from contextlib import asynccontextmanager
from app.services.redis_service import RedisService

from app.routes import auth


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

app.include_router(auth.router)


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": settings.VERSION}


@app.get("/")
async def root():
    return {"message": "CoQuest API", "docs": "/api/docs"}
