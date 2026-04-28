from supabase import create_client, Client
from functools import lru_cache
from core.config import get_settings

settings = get_settings()


@lru_cache()
def get_supabase() -> Client:
    """
    Singleton Supabase client using the service_role key.
    """
    if not settings.supabase_url or not settings.supabase_service_key:
        print("CRITICAL: Supabase environment variables are MISSING!")
        raise ValueError("Supabase configuration is incomplete. Check Vercel environment variables.")
    return create_client(settings.supabase_url, settings.supabase_service_key)
