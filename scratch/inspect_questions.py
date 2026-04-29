import os
from supabase import create_client

# Hardcoding for scratch investigation
url = "https://qtixgkmsfzvwoowktnhv.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0aXhna21zZnp2d29vd2t0bmh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MTg2NjYsImV4cCI6MjA5MTQ5NDY2Nn0.gPlZlqMp5mtab2bCFyAjCi0B-3n_VYRpBg-HE-5V-ag"
supabase = create_client(url, key)

def check_questions():
    res = supabase.table("questions").select("id, text, branch, exam_name").limit(100).execute()
    print(f"Total questions found: {len(res.data)}")
    for q in res.data:
        print(f"ID: {q['id']}, Branch: {q['branch']}, Exam: {q.get('exam_name')}, Text: {q['text'][:50]}...")

if __name__ == "__main__":
    check_questions()
