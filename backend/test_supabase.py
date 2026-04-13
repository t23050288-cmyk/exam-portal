import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY")

print(f"Connecting to {url}...")
try:
    supabase = create_client(url, key)
    print("Fetching questions...")
    result = supabase.table("questions").select("id").limit(1).execute()
    print("Result:", result)
except Exception as e:
    print("Error:", e)
