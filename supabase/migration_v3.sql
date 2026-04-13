-- ============================================================
-- MIGRATION: Fix legacy roll_number constraint
-- ============================================================

-- Remove NOT NULL constraint from legacy roll_number column
-- This ensures students can be created using the new USN system
-- without failing due to missing legacy data.

ALTER TABLE students ALTER COLUMN roll_number DROP NOT NULL;

-- Optional: If the column is unique, you might want to keep that 
-- or drop it if it conflicts. Usually it's better to keep uniqueness.
-- No change for now as NOT NULL was the primary blocker.
