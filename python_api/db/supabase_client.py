from supabase import create_client, Client
from functools import lru_cache
from core.config import get_settings

settings = get_settings()


@lru_cache()
def get_supabase() -> Client:
    """
    Singleton Supabase client using the service_role key.
    """
    url = settings.supabase_url or settings.SUPABASE_URL
    key = settings.supabase_service_key or settings.SUPABASE_SERVICE_KEY or settings.SUPABASE_ANON_KEY
    
    if not url or not key:
        print("CRITICAL: Supabase environment variables are MISSING!")
        raise ValueError("Supabase configuration is incomplete. Check environment variables.")
    return create_client(url, key)
