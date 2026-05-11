-- Migration: Fix exam_results history and constraints
-- 1. Add missing columns if they don't exist
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS exam_title TEXT;
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Update existing rows to have a default title if null (to avoid unique constraint issues)
UPDATE exam_results SET exam_title = 'Nexus Assessment' WHERE exam_title IS NULL;

-- 3. Drop the old unique constraint on student_id (if it exists)
-- We need to find the constraint name. Usually it's exam_results_student_id_key
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_results_student_id_key') THEN
        ALTER TABLE exam_results DROP CONSTRAINT exam_results_student_id_key;
    END IF;
END $$;

-- 4. Add new unique constraint for (student_id, exam_title)
-- This allows one result per student per specific exam
ALTER TABLE exam_results ADD CONSTRAINT exam_results_student_exam_unique UNIQUE (student_id, exam_title);

-- 5. Ensure exam_status also has necessary columns for hardening (if missing)
ALTER TABLE exam_status ADD COLUMN IF NOT EXISTS last_violation_at TIMESTAMPTZ;
ALTER TABLE exam_status ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE;
ALTER TABLE exam_status ADD COLUMN IF NOT EXISTS exam_title TEXT;
