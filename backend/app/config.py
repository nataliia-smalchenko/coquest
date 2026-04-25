from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "CoQuest"
    VERSION: str = "0.1.0"

    # Database
    DATABASE_URL: str

    # Automatic conversion for asyncpg
    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def assemble_db_connection(cls, v: str) -> str:
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Security
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Google OAuth
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str = "http://localhost:3000/auth/google/callback"

    # Resend (Email)
    RESEND_API_KEY: str
    RESEND_FROM_EMAIL: str = "CoQuest <noreply@coquest.io>"

    # Frontend URL
    FRONTEND_URL: str = "http://localhost:3000"

    # Cloudinary
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    CLOUDINARY_UPLOAD_PRESET: str = "coquest_preset"

    # Game session business rules
    RESULTS_AVAILABLE_DAYS: int = (
        30  # how long results are accessible after a session ends
    )
    TEAM_WAIT_TIMEOUT_MINUTES: int = (
        30  # max time a WAITING team can exist before cleanup
    )

    # WebSocket
    WS_HEARTBEAT_INTERVAL_SECONDS: int = 30  # interval between server → client pings

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",  # Ignore redundant variables in the system
    )


settings = Settings()
