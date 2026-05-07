import os
import sys

# Add the python_api folder to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), "python_api"))

from db.supabase_client import get_supabase

def clear_all_sessions():
    db = get_supabase()
    # Update all students where is_active_session is True
    print("Clearing all active student sessions in Supabase...")
    
    # We can fetch all students or just do a bulk update.
    # Supabase Python client might need an eq/in filter for updates,
    # so we'll fetch those who are active and update them.
    res = db.table("students").select("id").eq("is_active_session", True).execute()
    
    if not res.data:
        print("No active sessions found. You should be good to go!")
        return

    for student in res.data:
        db.table("students").update({"is_active_session": False, "current_token": None}).eq("id", student["id"]).execute()
        
    print(f"Successfully cleared {len(res.data)} active sessions!")

if __name__ == "__main__":
    clear_all_sessions()
