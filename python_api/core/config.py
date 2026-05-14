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
    jwt_expire_minutes: int = 43200

    # Admin
    admin_secret: str = "rudranshsarvam"

    # Admin — Inception Spectral Parser
    inception_api_key: str = ""  
    
    # Student — Groq AI (Rounds 3 & 4)
    groq_api_key: str = ""
    
    ai_model: str = "mercury-2"
    ai_base_url: str = "https://api.inceptionlabs.ai/v1"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    ai_thinking: bool = True

    # Exam
    exam_duration_minutes: int = 60

    # CORS — used only as fallback; index.py sets allow_origins=["*"]
    allowed_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:3001,http://127.0.0.1:3000"

    @property
    def allowed_origins_list(self) -> list[str]:
        raw_list = [o.strip() for o in self.allowed_origins.split(",")]
        cleaned = []
        for origin in raw_list:
            cleaned.append(origin)
            if origin.endswith("/"):
                cleaned.append(origin[:-1])
            else:
                cleaned.append(origin + "/")
        final = set(cleaned)
        for origin in cleaned:
            if "localhost" in origin:
                final.add(origin.replace("localhost", "127.0.0.1"))
            elif "127.0.0.1" in origin:
                final.add(origin.replace("127.0.0.1", "localhost"))
        return list(final)

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "../../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
