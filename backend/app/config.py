from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "CoQuest"
    VERSION: str = "0.1.0"

    # Database
    DATABASE_URL: str

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

    class Config:
        env_file = ".env"


settings = Settings()
