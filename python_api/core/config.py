from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
import os


class Settings(BaseSettings):
    # Supabase
    supabase_url: str = ""
    supabase_service_key: str = ""

    # Fallback/Alternate names
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    SUPABASE_ANON_KEY: str = ""

    # JWT
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 90

    # Admin
    admin_secret: str = "admin@examguard2024"

    # AI
    inception_api_key: str = ""
    ai_model: str = "deepseek-ai/deepseek-v4-pro"
    ai_base_url: str = "https://integrate.api.nvidia.com/v1"
    ai_thinking: bool = True

    # Exam
    exam_duration_minutes: int = 60

    # CORS
    allowed_origins: str = "http://localhost:3000,http://localhost:5173"

    @property
    def allowed_origins_list(self) -> list[str]:
        raw_list = [o.strip() for o in self.allowed_origins.split(",")]
        cleaned = set()
        for origin in raw_list:
            cleaned.add(origin.rstrip("/"))
        return list(cleaned)

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "../../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
