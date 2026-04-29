import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

def check_questions():
    res = supabase.table("questions").select("id, text, branch, exam_name").limit(50).execute()
    print(f"Total questions found: {len(res.data)}")
    for q in res.data:
        print(f"ID: {q['id']}, Branch: {q['branch']}, Exam: {q.get('exam_name')}, Text: {q['text'][:50]}...")

if __name__ == "__main__":
    check_questions()
