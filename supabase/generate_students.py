"""
Generate INSERT SQL for 266 students with bcrypt-hashed passwords.
All students get password: exam123

Usage:
  pip install passlib[bcrypt]
  python supabase/generate_students.py > supabase/students_266.sql
  Then run students_266.sql in Supabase Dashboard SQL Editor
"""
import sys

try:
    from passlib.hash import bcrypt
except ImportError:
    print("Run: pip install passlib[bcrypt]", file=sys.stderr)
    sys.exit(1)

PASSWORD = "exam123"
print("-- Auto-generated: 266 students for ExamGuard")
print("-- Password for all: exam123")
print()

# Generate bcrypt hash once (reuse for all — same password)
password_hash = bcrypt.hash(PASSWORD)

print("INSERT INTO students (roll_number, name, password_hash) VALUES")

names = [
    "Aarav Shah", "Priya Patel", "Rohan Verma", "Sneha Gupta", "Arjun Mehta",
    "Kavya Sharma", "Dev Joshi", "Ananya Singh", "Vikram Nair", "Meera Reddy",
    "Rahul Kumar", "Pooja Mishra", "Siddharth Das", "Neha Srivastava", "Aditya Rao",
    "Ishaan Bose", "Divya Pillai", "Karan Malhotra", "Riya Chatterjee", "Akash Tiwari",
]

rows = []
for i in range(1, 267):
    name_index = (i - 1) % len(names)
    base_name = names[name_index].split()  
    # Make names unique by appending a number suffix for repeats
    if i <= len(names):
        student_name = names[i - 1]
    else:
        student_name = f"{names[name_index]} {(i // len(names)) + 1}"
    
    roll = f"EX{i:03d}"
    rows.append(f"  ('{roll}', '{student_name}', '{password_hash}')")

print(",\n".join(rows) + ";")
print()
print("-- Initialize exam_status for all students")
print("INSERT INTO exam_status (student_id, status, warnings)")
print("SELECT id, 'not_started', 0 FROM students")
print("ON CONFLICT (student_id) DO NOTHING;")
