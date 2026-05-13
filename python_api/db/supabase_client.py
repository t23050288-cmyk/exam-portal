from supabase import create_client, Client
from functools import lru_cache
from core.config import get_settings
import httpx

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


def execute_sql(sql: str) -> dict:
    """Run raw SQL via Supabase management API (requires service key)."""
    url = settings.supabase_url or settings.SUPABASE_URL
    key = settings.supabase_service_key or settings.SUPABASE_SERVICE_KEY
    project_ref = url.replace("https://", "").split(".")[0]
    
    resp = httpx.post(
        f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"query": sql},
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()
