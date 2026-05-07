"""
Run this once to set is_active = true for all exam_config rows.
Usage: python activate_exam.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python_api"))

from db.supabase_client import get_supabase

db = get_supabase()

# Activate ALL exams
result = db.table("exam_config").update({"is_active": True}).neq("exam_title", "").execute()
print(f"Updated rows: {len(result.data or [])}")
for row in (result.data or []):
    print(f"  ✅ '{row.get('exam_title')}' → is_active={row.get('is_active')}")

if not result.data:
    print("⚠️  No rows updated. Check your SUPABASE_URL / SUPABASE_KEY in python_api/.env")
