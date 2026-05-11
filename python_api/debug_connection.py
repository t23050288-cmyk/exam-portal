import os
import sys
from dotenv import load_dotenv

# Add current dir to path to import local modules
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), "python_api"))

load_dotenv()

try:
    from python_api.db.supabase_client import get_supabase
    db = get_supabase()
    print("[DEBUG] Supabase Client Initialized")
    
    # 1. Test connection by fetching a single student
    students = db.table("students").select("id").limit(1).execute()
    print(f"[DEBUG] Connection test: Found {len(students.data)} students")
    
    # 2. Fetch questions count
    questions = db.table("questions").select("id", count="exact").limit(1).execute()
    print(f"[DEBUG] Questions count in DB: {questions.count}")
    
    # 3. Check for 'nb' exam specifically
    nb_questions = db.table("questions").select("id", "branch", "exam_name").eq("exam_name", "nb").execute()
    print(f"[DEBUG] Questions matching 'nb' exam_name: {len(nb_questions.data)}")
    
    if len(nb_questions.data) > 0:
        print(f"Sample 'nb' question branch: '{nb_questions.data[0].get('branch')}'")
    else:
        # Check all unique exam names
        all_exams = db.table("questions").select("exam_name").execute()
        unique = list(set(q.get("exam_name") for q in all_exams.data if q.get("exam_name")))
        print(f"[DEBUG] No 'nb' found. Unique exam_names in DB: {unique}")

except Exception as e:
    print(f"[DEBUG] ERROR: {e}")
    import traceback
    traceback.print_exc()
