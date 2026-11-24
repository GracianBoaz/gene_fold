import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/genefold")
    # Comma-separated list of allowed origins.
    # In production, set ALLOWED_ORIGINS to your Vercel frontend URL, e.g.:
    #   https://genefold.vercel.app
    # Use "*" to allow all origins (not recommended for production with credentials).
    allowed_origins: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")

    class Config:
        env_file = ".env"

settings = Settings()
