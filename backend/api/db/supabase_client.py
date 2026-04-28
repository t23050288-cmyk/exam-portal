from supabase import create_client, Client
from functools import lru_cache
from core.config import get_settings

settings = get_settings()


@lru_cache()
def get_supabase() -> Client:
    """
    Singleton Supabase client using the service_role key.
    Service key bypasses RLS — safe for backend-only use.
    Connection is reused across requests (connection pooling via lru_cache).
    """
    return create_client(settings.supabase_url, settings.supabase_service_key)
