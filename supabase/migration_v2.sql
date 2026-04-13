-- ============================================================
-- migration_v2.sql
-- Add missing columns for branch, usn, and email support
-- ============================================================

-- 1. Add missing columns to questions table
ALTER TABLE questions ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'CS';

-- 2. Add missing columns to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS usn TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'CS';

-- 3. Migrate roll_number to usn if usn is empty
UPDATE students SET usn = roll_number WHERE usn IS NULL;

-- 4. Set NOT NULL and indices (Recommended)
-- Note: usn must be unique and not null for the new auth logic
-- ALTER TABLE students ALTER COLUMN usn SET NOT NULL;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_students_usn ON students(usn);
