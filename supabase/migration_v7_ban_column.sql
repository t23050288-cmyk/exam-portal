-- Migration v7: Add is_banned and exams_completed to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS exams_completed INTEGER DEFAULT 0;
