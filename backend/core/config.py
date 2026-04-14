from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_service_key: str  # service_role key for backend

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 90  # slightly longer than exam duration

    # Admin
    admin_secret: str = "admin@examguard2024"

    # AI — Inception Spectral Parser
    inception_api_key: str = ""   # Set INCEPTION_API_KEY in .env to enable AI parsing
    ai_model: str = "mercury-coder-small"

    # Exam
    exam_duration_minutes: int = 60

    # CORS
    allowed_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:5173"

    @property
    def allowed_origins_list(self) -> list[str]:
        # Handle trailing slashes and common dev variants
        raw_list = [o.strip() for o in self.allowed_origins.split(",")]
        cleaned = []
        for origin in raw_list:
            cleaned.append(origin)
            if origin.endswith("/"):
                cleaned.append(origin[:-1])
            else:
                cleaned.append(origin + "/")
        # Also ensure both localhost and 127.0.0.1 variants are supported if either is present
        final = set(cleaned)
        for origin in cleaned:
            if "localhost" in origin:
                final.add(origin.replace("localhost", "127.0.0.1"))
            elif "127.0.0.1" in origin:
                final.add(origin.replace("127.0.0.1", "localhost"))
        return list(final)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
